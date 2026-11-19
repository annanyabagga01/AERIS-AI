import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getIndiaSimulatedSnapshot,
  resolveSimulationIntervalMs,
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
  SIMULATION_DISCLAIMER_TEXT,
} from '../src/lib/indiaSimulation.ts';

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default function handler(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  const intervalMs = resolveSimulationIntervalMs(
    process.env.SIMULATION_INTERVAL_MS
  );
  const snapshot = getIndiaSimulatedSnapshot(Date.now(), intervalMs);
  sendJson(res, 200, {
    success: true,
    status: 'ok',
    timestampIso: new Date().toISOString(),
    endpoints: [
      '/api/health',
      '/api/india/aqi',
      '/api/aqi',
      '/api/location/approximate',
    ],
    integrations: {
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY?.trim() &&
          !process.env.GEMINI_API_KEY.trim().startsWith('YOUR_')
      ),
      firebaseConfigured: Boolean(
        process.env.VITE_FIREBASE_PROJECT_ID?.trim() &&
          process.env.VITE_FIREBASE_API_KEY?.trim()
      ),
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
}
