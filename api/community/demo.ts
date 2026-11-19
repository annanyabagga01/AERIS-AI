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
      'Demo Community Reference Data. Sign in with Google and opt in to submit and view live anonymous Firestore community actions.',
    challenges: DEMO_CHALLENGES,
    contributions: DEMO_CONTRIBUTIONS,
  });
}
