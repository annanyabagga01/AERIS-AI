import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../../server/http.ts';
import {
  detectApproximateIndianCity,
  extractClientIp,
} from '../../server/location.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${req.method} not allowed. Use GET /api/location/approximate.`,
    });
    return;
  }

  try {
    const clientIp = extractClientIp({
      headers: req.headers,
      socket: req.socket,
    });
    const result = await detectApproximateIndianCity(clientIp);
    sendJson(res, 200, result);
  } catch {
    sendJson(res, 200, {
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
}
