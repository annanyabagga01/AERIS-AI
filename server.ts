import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCpcbAqi, INDIAN_CITIES } from './src/lib/aqi.ts';
import {
  calculateCommuteImpact,
  EMISSION_FACTORS_KG_PER_KM,
} from './src/lib/emissions.ts';
import {
  buildSimulatedCityAqiResponse,
  getIndiaSimulatedSnapshot,
  queryIndiaSimulatedApi,
  resolveSimulationIntervalMs,
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
  SIMULATION_DISCLAIMER_TEXT,
} from './src/lib/indiaSimulation.ts';
import type {
  CityAqiResponse,
  EmissionsInput,
  FamilyPreferences,
} from './src/lib/types.ts';
import {
  DEMO_CHALLENGES,
  DEMO_CONTRIBUTIONS,
} from './server/adapters/demoData.ts';
import {
  generateAerisRecommendations,
  isGeminiConfigured,
} from './server/ai/gemini.ts';
import {
  detectApproximateIndianCity,
  extractClientIp,
} from './server/location.ts';
import { redactSecrets } from './server/security.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const SIMULATION_INTERVAL_MS = resolveSimulationIntervalMs(
  process.env.SIMULATION_INTERVAL_MS
);

class UnsupportedCityError extends Error {
  status = 404;
  supportedCities = INDIAN_CITIES.map((c) => c.name);
  constructor(cityName: string) {
    super(
      `City "${cityName}" is not in the AERIS AI simulated Indian city catalog.`
    );
    this.name = 'UnsupportedCityError';
  }
}

function resolveSimulatedCityAqi(
  cityQuery: string,
  options?: { station?: string }
): CityAqiResponse {
  const trimmedQuery = cityQuery.trim() || 'Delhi';
  const result = buildSimulatedCityAqiResponse(trimmedQuery, classifyCpcbAqi, {
    station: options?.station,
    intervalMs: SIMULATION_INTERVAL_MS,
  });
  if (!result) {
    throw new UnsupportedCityError(trimmedQuery);
  }
  return result;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(self)'
    );
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  // 1. Health & configuration check (non-secret status only, never expose keys)
  app.get('/api/health', (_req, res) => {
    const snapshot = getIndiaSimulatedSnapshot(Date.now(), SIMULATION_INTERVAL_MS);
    const firebaseConfigExists =
      fs.existsSync(path.join(__dirname, 'firebase-applet-config.json')) ||
      Boolean(
        process.env.VITE_FIREBASE_PROJECT_ID?.trim() &&
          !process.env.VITE_FIREBASE_PROJECT_ID.trim().startsWith('your-') &&
          process.env.VITE_FIREBASE_API_KEY?.trim() &&
          !process.env.VITE_FIREBASE_API_KEY.trim().startsWith('YOUR_')
      );
    res.json({
      success: true,
      status: 'ok',
      timestampIso: new Date().toISOString(),
      endpoints: [
        '/api/health',
        '/api/india/aqi',
        '/api/aqi',
        '/api/location/approximate',
        '/api/community/demo',
      ],
      integrations: {
        geminiConfigured: isGeminiConfigured(),
        firebaseConfigured: firebaseConfigExists,
        simulationEngineActive: true,
      },
      simulationEngine: {
        dataSource: SIMULATION_DATA_SOURCE,
        dataType: SIMULATION_DATA_TYPE,
        badge: SIMULATION_BADGE_TEXT,
        disclaimer: SIMULATION_DISCLAIMER_TEXT,
        totalStations: snapshot.summary.totalStations,
        statesCovered: snapshot.summary.statesCovered,
        unionTerritoriesCovered: snapshot.summary.unionTerritoriesCovered,
        intervalMs: snapshot.intervalMs,
        generatedAt: snapshot.generatedAt,
        nextUpdateAt: snapshot.nextUpdateAt,
      },
    });
  });

  // 1b. Temporary server-side IP approximate Indian city detection (zero storage)
  app.get('/api/location/approximate', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const clientIp = extractClientIp(req);
      const result = await detectApproximateIndianCity(clientIp);
      res.json(result);
    } catch {
      res.json({
        detected: false,
        city: null,
        state: null,
        stateCode: null,
        region: null,
        detectionMethod: 'unavailable',
        isApproximate: true,
        coordinatesStored: false,
        provider: null,
        reason: 'lookup_unavailable',
        message:
          'Approximate IP city detection is temporarily unavailable. Please select an Indian city manually.',
      });
    }
  });

  // 2. Self-generated India-wide simulated AQI API (all 28 states + 8 UTs)
  app.get('/api/india/aqi', (req, res) => {
    try {
      const state =
        typeof req.query.state === 'string'
          ? req.query.state.trim().slice(0, 80)
          : undefined;
      const city =
        typeof req.query.city === 'string'
          ? req.query.city.trim().slice(0, 80)
          : undefined;
      const station =
        typeof req.query.station === 'string' &&
        req.query.station.trim().length > 0
          ? req.query.station.trim().slice(0, 120)
          : undefined;
      const category =
        typeof req.query.category === 'string'
          ? req.query.category.trim().slice(0, 32)
          : undefined;
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim().slice(0, 100)
          : undefined;
      const includeCityDetail =
        req.query.includeCityDetail === '1' ||
        req.query.includeCityDetail === 'true';

      const payload = queryIndiaSimulatedApi({
        state,
        city,
        category,
        search,
        intervalMs: SIMULATION_INTERVAL_MS,
      });

      if (includeCityDetail) {
        const cityTarget = city || 'Delhi';
        const cityDetail =
          buildSimulatedCityAqiResponse(cityTarget, classifyCpcbAqi, {
            station,
            intervalMs: SIMULATION_INTERVAL_MS,
          }) ?? undefined;
        if (!cityDetail) {
          res.status(404).json({
            success: false,
            error: `City "${cityTarget}" is not in the AERIS AI simulated Indian city catalog.`,
            data_type: SIMULATION_DATA_TYPE,
            data_source: SIMULATION_DATA_SOURCE,
            supportedCities: INDIAN_CITIES.map((c) => c.name),
          });
          return;
        }
        payload.cityDetail = cityDetail;
      }

      res.json(payload);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: redactSecrets(
          err instanceof Error
            ? err.message
            : 'Unable to generate simulated India AQI dataset.'
        ),
      });
    }
  });

  // 3. City AQI endpoint powered by AERIS AI Simulation Engine
  app.get('/api/aqi', (req, res) => {
    try {
      const city =
        typeof req.query.city === 'string' && req.query.city.trim().length > 0
          ? req.query.city.trim().slice(0, 60)
          : 'Delhi';
      const station =
        typeof req.query.station === 'string' && req.query.station.trim().length > 0
          ? req.query.station.trim().slice(0, 120)
          : undefined;

      const data = resolveSimulatedCityAqi(city, { station });
      res.json({
        success: true,
        data_type: SIMULATION_DATA_TYPE,
        data_source: SIMULATION_DATA_SOURCE,
        generated_at: data.lastUpdatedIso,
        total_stations: data.stations.length,
        ...data,
      });
    } catch (err) {
      if (err instanceof UnsupportedCityError) {
        res.status(404).json({
          success: false,
          error: err.message,
          supportedCities: err.supportedCities,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: redactSecrets(
          err instanceof Error
            ? err.message
            : 'Unable to retrieve simulated air quality data.'
        ),
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

      const simulatedContext = resolveSimulatedCityAqi(body.city, { station });
      const { sanitizeChatHistory, evaluateAqiVerificationStatus } = await import(
        './src/lib/aiContext.ts'
      );
      const history = sanitizeChatHistory(body.history, 8);
      const verification = evaluateAqiVerificationStatus(simulatedContext);

      const structured = await generateAerisRecommendations({
        aqiContext: simulatedContext,
        preferences: body.preferences,
        userPrompt:
          typeof body.question === 'string'
            ? body.question.slice(0, 1000)
            : undefined,
        history,
      });

      res.json({
        verifiedContext: {
          city: simulatedContext.city,
          station:
            simulatedContext.selectedStationName ??
            simulatedContext.stations[0]?.station ??
            null,
          primaryAqi: simulatedContext.primaryAqi,
          category: simulatedContext.category,
          lastUpdatedIso: simulatedContext.lastUpdatedIso,
          dataMode: simulatedContext.dataMode,
          dataSource: simulatedContext.dataSource,
          dataType: simulatedContext.dataType,
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
      const message = redactSecrets(
        err instanceof Error
          ? err.message
          : 'Gemini AI recommendation request failed.'
      );
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
      success: true,
      isDemo: true,
      disclaimer:
        'Demo Community Reference Data. Sign in with Google and opt in to submit and view live anonymous Firestore community actions.',
      challenges: DEMO_CHALLENGES,
      contributions: DEMO_CONTRIBUTIONS,
    });
  });

  // Explicit JSON 404 handler for any unregistered /api/* route (never fall through to HTML)
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`,
      availableEndpoints: [
        'GET /api/health',
        'GET /api/india/aqi',
        'GET /api/aqi',
        'GET /api/location/approximate',
        'GET /api/community/demo',
        'POST /api/ai/chat',
        'POST /api/ai/recommendations',
        'POST /api/impact/calculate',
      ],
    });
  });

  // Mount Vite in dev or serve built assets in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
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
