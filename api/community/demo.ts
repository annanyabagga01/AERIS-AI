import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DEMO_CHALLENGES,
  DEMO_CONTRIBUTIONS,
} from '../../server/adapters/demoData.ts';
import { sendJson } from '../../server/ai/handler.ts';

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${req.method} not allowed. Use GET /api/community/demo.`,
    });
    return;
  }

  sendJson(res, 200, {
    success: true,
    isDemo: true,
    disclaimer:
      'This is an interactive demonstration. Community statistics and participation records are simulated and are not live community submissions.',
    challenges: DEMO_CHALLENGES,
    contributions: DEMO_CONTRIBUTIONS,
  });
}
