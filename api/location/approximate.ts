import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  detectApproximateIndianCity,
  extractClientIp,
} from '../../server/location.ts';

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
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
