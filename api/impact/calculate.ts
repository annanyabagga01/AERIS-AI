import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '../../server/ai/handler.ts';
import {
  calculateCommuteImpact,
  EMISSION_FACTORS_KG_PER_KM,
} from '../../src/lib/emissions.ts';
import type { EmissionsInput } from '../../src/lib/types.ts';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${req.method ?? 'UNKNOWN'} not allowed. Use POST /api/impact/calculate.`,
    });
    return;
  }

  let body: Partial<EmissionsInput>;
  try {
    body = await readJsonBody<Partial<EmissionsInput>>(req);
  } catch {
    sendJson(res, 400, {
      success: false,
      error: 'Invalid JSON request payload.',
    });
    return;
  }

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
    sendJson(res, 400, {
      success: false,
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

  sendJson(res, 200, result);
}
