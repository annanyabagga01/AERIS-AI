import type { IncomingMessage, ServerResponse } from 'node:http';
import { isGeminiConfigured } from '../server/ai/gemini.ts';
import { cleanFirebaseConfigValue } from '../src/lib/firebaseConfig.ts';
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
  const geminiConfigured = isGeminiConfigured();
  const firebaseConfigured = Boolean(
    cleanFirebaseConfigValue(process.env.VITE_FIREBASE_API_KEY) &&
      cleanFirebaseConfigValue(process.env.VITE_FIREBASE_AUTH_DOMAIN) &&
      cleanFirebaseConfigValue(process.env.VITE_FIREBASE_PROJECT_ID) &&
      cleanFirebaseConfigValue(process.env.VITE_FIREBASE_APP_ID)
  );

  sendJson(res, 200, {
    success: true,
    status: 'ok',
    timestampIso: new Date().toISOString(),
    endpoints: [
      '/api/health',
      '/api/india/aqi',
      '/api/aqi',
      '/api/location/approximate',
      '/api/ai/recommendations',
      '/api/ai/chat',
      '/api/impact/calculate',
      '/api/community/demo',
    ],
    integrations: {
      geminiConfigured,
      firebaseConfigured,
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
