import type { IncomingMessage, ServerResponse } from 'node:http';
import { classifyCpcbAqi, INDIAN_CITIES } from '../src/lib/aqi.ts';
import {
  buildSimulatedCityAqiResponse,
  resolveSimulationIntervalMs,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from '../src/lib/indiaSimulation.ts';

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
      error: `Method ${req.method} not allowed. Use GET /api/aqi.`,
    });
    return;
  }

  try {
    const url = new URL(req.url ?? '/api/aqi', 'http://localhost');
    const city = url.searchParams.get('city')?.trim().slice(0, 60) || 'Delhi';
    const station =
      url.searchParams.get('station')?.trim().slice(0, 120) || undefined;
    const intervalMs = resolveSimulationIntervalMs(
      process.env.SIMULATION_INTERVAL_MS
    );

    const data = buildSimulatedCityAqiResponse(city, classifyCpcbAqi, {
      station,
      intervalMs,
    });

    if (!data) {
      sendJson(res, 404, {
        success: false,
        error: `City "${city}" is not in the AERIS AI simulated Indian city catalog.`,
        supportedCities: INDIAN_CITIES.map((c) => c.name),
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data_type: SIMULATION_DATA_TYPE,
      data_source: SIMULATION_DATA_SOURCE,
      generated_at: data.lastUpdatedIso,
      total_stations: data.stations.length,
      ...data,
    });
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to retrieve simulated air quality data.',
    });
  }
}
