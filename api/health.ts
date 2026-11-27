import type { IncomingMessage, ServerResponse } from 'node:http';
import { isGeminiConfigured } from '../server/ai/gemini.ts';
import { sendJson } from '../server/http.ts';
import {
  getIndiaSimulatedSnapshot,
  resolveSimulationIntervalMs,
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
  SIMULATION_DISCLAIMER_TEXT,
} from '../src/lib/indiaSimulation.ts';

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${req.method} not allowed. Use GET /api/health.`,
    });
    return;
  }

  const intervalMs = resolveSimulationIntervalMs(
    process.env.SIMULATION_INTERVAL_MS
  );
  const snapshot = getIndiaSimulatedSnapshot(Date.now(), intervalMs);
  const geminiConfigured = isGeminiConfigured();

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
      communityDemoMode: true,
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
