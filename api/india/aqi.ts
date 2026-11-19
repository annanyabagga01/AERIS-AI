import type { IncomingMessage, ServerResponse } from 'node:http';
import { classifyCpcbAqi, INDIAN_CITIES } from '../../src/lib/aqi.ts';
import {
  buildSimulatedCityAqiResponse,
  queryIndiaSimulatedApi,
  resolveSimulationIntervalMs,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from '../../src/lib/indiaSimulation.ts';

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${req.method} not allowed. Use GET /api/india/aqi.`,
    });
    return;
  }

  try {
    const url = new URL(req.url ?? '/api/india/aqi', 'http://localhost');
    const state = url.searchParams.get('state')?.trim().slice(0, 80) || undefined;
    const city = url.searchParams.get('city')?.trim().slice(0, 80) || undefined;
    const station =
      url.searchParams.get('station')?.trim().slice(0, 120) || undefined;
    const category =
      url.searchParams.get('category')?.trim().slice(0, 32) || undefined;
    const search =
      url.searchParams.get('search')?.trim().slice(0, 100) || undefined;
    const includeCityDetail =
      url.searchParams.get('includeCityDetail') === '1' ||
      url.searchParams.get('includeCityDetail') === 'true';

    const intervalMs = resolveSimulationIntervalMs(
      process.env.SIMULATION_INTERVAL_MS
    );

    const payload = queryIndiaSimulatedApi({
      state,
      city,
      category,
      search,
      intervalMs,
    });

    if (includeCityDetail) {
      const cityTarget = city || 'Delhi';
      const cityDetail =
        buildSimulatedCityAqiResponse(cityTarget, classifyCpcbAqi, {
          station,
          intervalMs,
        }) ?? undefined;
      if (!cityDetail) {
        sendJson(res, 404, {
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

    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to generate simulated India AQI dataset.',
    });
  }
}
