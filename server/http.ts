import type { ServerResponse } from 'node:http';
import { EMISSION_FACTORS_KG_PER_KM } from '../src/lib/emissions.ts';
import type { EmissionsInput } from '../src/lib/types.ts';

/**
 * Writes a JSON response with standard security and cache-control headers.
 */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

/**
 * Validates and normalizes an emissions calculation request body.
 * Returns null if any required field is missing, non-finite, or out of range.
 */
export function validateEmissionsPayload(
  body: Partial<EmissionsInput> | null | undefined
): EmissionsInput | null {
  if (
    !body ||
    typeof body !== 'object' ||
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
    body.oneWayDistanceKm > 500 ||
    body.tripsPerWeek <= 0 ||
    body.tripsPerWeek > 100
  ) {
    return null;
  }

  return {
    baselineMode: body.baselineMode,
    alternativeMode: body.alternativeMode as EmissionsInput['alternativeMode'],
    oneWayDistanceKm: body.oneWayDistanceKm,
    tripsPerWeek: body.tripsPerWeek,
    aqi:
      typeof body.aqi === 'number' && Number.isFinite(body.aqi)
        ? body.aqi
        : null,
    pollutionSensitiveHousehold: Boolean(body.pollutionSensitiveHousehold),
  };
}
