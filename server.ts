import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INDIAN_CITIES,
  resolveStationSelection,
  resolveSupportedCity,
} from './src/lib/aqi.ts';
import {
  calculateCommuteImpact,
  EMISSION_FACTORS_KG_PER_KM,
} from './src/lib/emissions.ts';
import type {
  CityAqiResponse,
  EmissionsInput,
  FamilyPreferences,
  SourceHealthReport,
} from './src/lib/types.ts';
import {
  fetchCpcbStations,
  getLastCpcbHealth,
  isCpcbConfigured,
} from './server/adapters/cpcb.ts';
import {
  buildDemoAllCitiesStations,
  buildDemoCityResponse,
  DEMO_CHALLENGES,
  DEMO_CONTRIBUTIONS,
} from './server/adapters/demoData.ts';
import {
  fetchOpenAqSensors,
  getLastOpenAqHealth,
  isOpenAqConfigured,
} from './server/adapters/openaq.ts';
import {
  generateAerisRecommendations,
  isGeminiConfigured,
} from './server/ai/gemini.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

class UnsupportedCityError extends Error {
  status = 404;
  supportedCities = INDIAN_CITIES.map((c) => c.name);
  constructor(cityName: string) {
    super(
      `City "${cityName}" is not in the supported Indian monitoring catalog (${INDIAN_CITIES.map((c) => c.name).join(', ')}).`
    );
    this.name = 'UnsupportedCityError';
  }
}

async function resolveCityAqi(
  cityQuery: string,
  options?: { station?: string; forceRefresh?: boolean }
): Promise<CityAqiResponse> {
  const trimmedQuery = cityQuery.trim() || 'Delhi';
  const matchedCity = resolveSupportedCity(trimmedQuery);

  if (!matchedCity) {
    const cpcbCheck = await fetchCpcbStations({
      cityFilter: trimmedQuery,
      forceRefresh: options?.forceRefresh,
    });
    if (cpcbCheck.configured && cpcbCheck.stations.length > 0) {
      const stations = cpcbCheck.stations;
      const selection = resolveStationSelection(stations, options?.station);
      const first = selection.selectedStation ?? stations[0];
      return {
        city: first.city || trimmedQuery,
        state: first.state || 'India',
        lat: first.lat || 22.9734,
        lng: first.lng || 78.6569,
        primaryAqi: selection.primaryAqi,
        category: selection.categoryMeta.category,
        categoryMeta: selection.categoryMeta,
        predominantPollutant: selection.predominantPollutant,
        selectedStationId: selection.selectedStation?.id ?? null,
        selectedStationName: selection.selectedStation?.station ?? null,
        stations,
        openAqSensors: [],
        trend24h: [],
        lastUpdatedIso: selection.lastUpdatedIso,
        dataMode: selection.primaryAqi !== null ? 'live' : 'partial',
        sourceDisclaimer:
          selection.primaryAqi !== null
            ? 'Live official CPCB station feed via data.gov.in.'
            : 'CPCB stations returned incomplete pollutant readings or incompatible units; official AQI is marked Unavailable.',
        hasOfficialData: true,
        hasOpenAqData: false,
        staleStationsCount: stations.filter((s) => s.isStale).length,
        sourceHealth: {
          cpcb: cpcbCheck.health,
          openAq: getLastOpenAqHealth(),
        },
      };
    }
    throw new UnsupportedCityError(trimmedQuery);
  }

  const [cpcbResult, openAqResult] = await Promise.all([
    fetchCpcbStations({
      cityFilter: matchedCity.name,
      forceRefresh: options?.forceRefresh,
    }),
    fetchOpenAqSensors(matchedCity.name, matchedCity.lat, matchedCity.lng, {
      forceRefresh: options?.forceRefresh,
    }),
  ]);

  const sourceHealth: SourceHealthReport = {
    cpcb: cpcbResult.health,
    openAq: openAqResult.health,
  };

  if (cpcbResult.configured && cpcbResult.stations.length > 0) {
    const stations = cpcbResult.stations;
    const selection = resolveStationSelection(stations, options?.station);

    return {
      city: matchedCity.name,
      state: matchedCity.state,
      lat: selection.selectedStation?.lat ?? matchedCity.lat,
      lng: selection.selectedStation?.lng ?? matchedCity.lng,
      primaryAqi: selection.primaryAqi,
      category: selection.categoryMeta.category,
      categoryMeta: selection.categoryMeta,
      predominantPollutant: selection.predominantPollutant,
      selectedStationId: selection.selectedStation?.id ?? null,
      selectedStationName: selection.selectedStation?.station ?? null,
      stations,
      openAqSensors: openAqResult.sensors,
      trend24h: [],
      lastUpdatedIso: selection.lastUpdatedIso,
      dataMode: selection.primaryAqi !== null ? 'live' : 'partial',
      sourceDisclaimer:
        selection.primaryAqi !== null
          ? 'Live official CPCB station feed via data.gov.in.' +
            (openAqResult.sensors.length > 0
              ? ' OpenAQ v3 sensor readings are shown separately and never replace official Indian National AQI.'
              : '')
          : 'CPCB stations returned incomplete pollutant readings or incompatible units; official AQI is marked Unavailable.',
      hasOfficialData: true,
      hasOpenAqData: openAqResult.sensors.length > 0,
      staleStationsCount: stations.filter((s) => s.isStale).length,
      sourceHealth,
    };
  }

  const demo = buildDemoCityResponse(
    matchedCity.name,
    options?.station,
    sourceHealth
  );

  if (cpcbResult.error) {
    demo.sourceDisclaimer = `CPCB data.gov.in error (${cpcbResult.error}). Showing clearly labeled Demo Reference Data instead of fabricating live values.`;
  } else if (cpcbResult.configured && cpcbResult.stations.length === 0) {
    demo.sourceDisclaimer = `CPCB data.gov.in returned 0 stations for ${matchedCity.name}. Showing clearly labeled Demo Reference Data.`;
  }

  if (openAqResult.sensors.length > 0) {
    demo.openAqSensors = openAqResult.sensors;
    demo.hasOpenAqData = true;
    demo.dataMode = 'partial';
    demo.sourceDisclaimer =
      'CPCB feed unavailable; city baseline uses clearly labeled Demo Reference Data while live OpenAQ v3 sensor readings are shown separately (never substituted for official Indian National AQI).';
  }
  return demo;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // 1. Health & configuration check (non-secret status only, never expose keys)
  app.get('/api/health', (_req, res) => {
    const firebaseConfigExists = fs.existsSync(
      path.join(__dirname, 'firebase-applet-config.json')
    );
    res.json({
      status: 'ok',
      timestampIso: new Date().toISOString(),
      integrations: {
        geminiConfigured: isGeminiConfigured(),
        cpcbConfigured: isCpcbConfigured(),
        openAqConfigured: isOpenAqConfigured(),
        firebaseConfigured: firebaseConfigExists,
      },
      sources: {
        cpcb: getLastCpcbHealth(),
        openAq: getLastOpenAqHealth(),
      },
    });
  });

  // 2. City AQI endpoint (CPCB primary -> OpenAQ sensor -> labeled Demo fallback)
  app.get('/api/aqi', async (req, res) => {
    try {
      const city =
        typeof req.query.city === 'string' && req.query.city.trim().length > 0
          ? req.query.city.trim().slice(0, 60)
          : 'Delhi';
      const station =
        typeof req.query.station === 'string' && req.query.station.trim().length > 0
          ? req.query.station.trim().slice(0, 120)
          : undefined;
      const forceRefresh =
        req.query.refresh === '1' || req.query.refresh === 'true';

      const data = await resolveCityAqi(city, { station, forceRefresh });
      res.json(data);
    } catch (err) {
      if (err instanceof UnsupportedCityError) {
        res.status(404).json({
          error: err.message,
          supportedCities: err.supportedCities,
        });
        return;
      }
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to retrieve air quality data.',
      });
    }
  });

  // 3. All stations across India for Pollution Map
  app.get('/api/aqi/all', async (req, res) => {
    try {
      const forceRefresh =
        req.query.refresh === '1' || req.query.refresh === 'true';
      const cpcbResult = await fetchCpcbStations({ forceRefresh });
      if (cpcbResult.configured && cpcbResult.stations.length > 0) {
        res.json({
          dataMode: 'live',
          stations: cpcbResult.stations,
          disclaimer: 'Live official CPCB station feed via data.gov.in.',
          sourceHealth: { cpcb: cpcbResult.health },
        });
        return;
      }
      res.json({
        dataMode: 'demo',
        stations: buildDemoAllCitiesStations(),
        disclaimer: cpcbResult.error
          ? `CPCB feed error (${cpcbResult.error}). Showing Demo Reference Stations (Not Live).`
          : 'Demo Reference Stations (Not Live). Configure DATA_GOV_IN_API_KEY and DATA_GOV_IN_RESOURCE_ID for official live station markers.',
        sourceHealth: { cpcb: cpcbResult.health },
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load station map data.',
      });
    }
  });

  // 4. Server-side Gemini AI conversational advisor
  const handleAiChatRequest = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const body = req.body as {
        city?: string;
        station?: string;
        preferences?: FamilyPreferences;
        question?: string;
        history?: unknown;
      };
      if (!body || typeof body.city !== 'string' || !body.preferences) {
        res.status(400).json({
          error: 'Invalid request: city and preferences are required.',
        });
        return;
      }

      const station =
        typeof body.station === 'string' &&
        body.station.trim().length > 0 &&
        body.station.trim().toLowerCase() !== 'all'
          ? body.station.trim().slice(0, 120)
          : undefined;

      const verifiedContext = await resolveCityAqi(body.city, { station });
      const { sanitizeChatHistory, evaluateAqiVerificationStatus } = await import(
        './src/lib/aiContext.ts'
      );
      const history = sanitizeChatHistory(body.history, 8);
      const verification = evaluateAqiVerificationStatus(verifiedContext);

      const structured = await generateAerisRecommendations({
        aqiContext: verifiedContext,
        preferences: body.preferences,
        userPrompt:
          typeof body.question === 'string'
            ? body.question.slice(0, 1000)
            : undefined,
        history,
      });

      res.json({
        verifiedContext: {
          city: verifiedContext.city,
          station:
            verifiedContext.selectedStationName ??
            verifiedContext.stations[0]?.station ??
            null,
          primaryAqi: verifiedContext.primaryAqi,
          category: verifiedContext.category,
          lastUpdatedIso: verifiedContext.lastUpdatedIso,
          dataMode: verifiedContext.dataMode,
          isLiveVerified: verification.isLiveVerified,
          verificationNotice: verification.verificationNotice,
        },
        recommendation: structured,
      });
    } catch (err) {
      if (err instanceof UnsupportedCityError) {
        res.status(404).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Gemini AI recommendation request failed.';
      const status =
        message.includes('not configured') ||
        message.includes('503') ||
        message.includes('timed out')
          ? 503
          : message.includes('429')
          ? 429
          : 500;
      res.status(status).json({ error: message });
    }
  };

  app.post('/api/ai/recommendations', handleAiChatRequest);
  app.post('/api/ai/chat', handleAiChatRequest);

  // 5. Server-side emissions calculator
  app.post('/api/impact/calculate', (req, res) => {
    const body = req.body as Partial<EmissionsInput>;
    if (
      !body ||
      (body.baselineMode !== 'solo_car' && body.baselineMode !== 'two_wheeler') ||
      typeof body.alternativeMode !== 'string' ||
      !Object.prototype.hasOwnProperty.call(
        EMISSION_FACTORS_KG_PER_KM,
        body.alternativeMode
      ) ||
      typeof body.oneWayDistanceKm !== 'number' ||
      typeof body.tripsPerWeek !== 'number' ||
      !Number.isFinite(body.oneWayDistanceKm) ||
      !Number.isFinite(body.tripsPerWeek) ||
      body.oneWayDistanceKm <= 0 ||
      body.tripsPerWeek <= 0
    ) {
      res.status(400).json({
        error: 'Invalid emissions calculation payload.',
      });
      return;
    }

    const result = calculateCommuteImpact({
      baselineMode: body.baselineMode,
      alternativeMode: body.alternativeMode,
      oneWayDistanceKm: body.oneWayDistanceKm,
      tripsPerWeek: body.tripsPerWeek,
      aqi: typeof body.aqi === 'number' ? body.aqi : null,
      pollutionSensitiveHousehold: Boolean(body.pollutionSensitiveHousehold),
    });

    res.json(result);
  });

  // 6. Demo Community dataset (used when signed-out / Firebase opt-in inactive)
  app.get('/api/community/demo', (_req, res) => {
    res.json({
      isDemo: true,
      disclaimer:
        'Demo Community Reference Data. Sign in with Google and opt in to submit and view live anonymous Firestore community actions.',
      challenges: DEMO_CHALLENGES,
      contributions: DEMO_CONTRIBUTIONS,
    });
  });

  // Mount Vite in dev or serve built assets in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AERIS AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AERIS AI server:', err);
  process.exit(1);
});
