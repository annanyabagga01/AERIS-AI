import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody } from '../../server/ai/handler.ts';
import { sendJson, validateEmissionsPayload } from '../../server/http.ts';
import { calculateCommuteImpact } from '../../src/lib/emissions.ts';
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

  const validated = validateEmissionsPayload(body);
  if (!validated) {
    sendJson(res, 400, {
      success: false,
      error: 'Invalid emissions calculation payload.',
    });
    return;
  }

  sendJson(res, 200, calculateCommuteImpact(validated));
}
