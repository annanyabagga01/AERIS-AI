import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  evaluateAqiVerificationStatus,
  sanitizeChatHistory,
} from '../../src/lib/aiContext.ts';
import { classifyCpcbAqi, INDIAN_CITIES } from '../../src/lib/aqi.ts';
import {
  buildSimulatedCityAqiResponse,
  resolveSimulationIntervalMs,
} from '../../src/lib/indiaSimulation.ts';
import type { FamilyPreferences } from '../../src/lib/types.ts';
import { redactSecrets } from '../security.ts';
import { generateAerisRecommendations } from './gemini.ts';

const MAX_BODY_BYTES = 256 * 1024;

export interface AiChatRequestBody {
  city?: string;
  station?: string;
  preferences?: Partial<FamilyPreferences>;
  question?: string;
  message?: string;
  history?: unknown;
}

const VALID_COMMUTE_MODES = new Set([
  'solo_car',
  'two_wheeler',
  'metro',
  'bus',
  'carpool',
  'ev_cab',
  'walk_cycle',
  'wfh',
]);

function normalizePreferences(
  city: string,
  raw: Partial<FamilyPreferences>
): FamilyPreferences {
  const householdSize =
    typeof raw.householdSize === 'number' &&
    Number.isFinite(raw.householdSize) &&
    raw.householdSize >= 1
      ? Math.min(20, Math.round(raw.householdSize))
      : 2;

  const commuteMode =
    typeof raw.commuteMode === 'string' && VALID_COMMUTE_MODES.has(raw.commuteMode)
      ? (raw.commuteMode as FamilyPreferences['commuteMode'])
      : 'metro';

  const preferredExerciseTime =
    raw.preferredExerciseTime === 'morning' ||
    raw.preferredExerciseTime === 'afternoon' ||
    raw.preferredExerciseTime === 'evening' ||
    raw.preferredExerciseTime === 'indoor_only'
      ? raw.preferredExerciseTime
      : 'morning';

  return {
    city,
    householdSize,
    hasChildren: Boolean(raw.hasChildren),
    hasOlderAdults: Boolean(raw.hasOlderAdults),
    pollutionSensitiveHousehold: Boolean(raw.pollutionSensitiveHousehold),
    commuteMode,
    workStartHour:
      typeof raw.workStartHour === 'string' && raw.workStartHour.trim()
        ? raw.workStartHour.trim().slice(0, 10)
        : '09:00',
    workEndHour:
      typeof raw.workEndHour === 'string' && raw.workEndHour.trim()
        ? raw.workEndHour.trim().slice(0, 10)
        : '18:00',
    preferredExerciseTime,
    anonymousHandle:
      typeof raw.anonymousHandle === 'string' && raw.anonymousHandle.trim()
        ? raw.anonymousHandle.trim().slice(0, 40)
        : 'Aeris-Household',
    communityOptIn: Boolean(raw.communityOptIn),
  };
}

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJsonBody<T>(
  req: IncomingMessage & { body?: unknown }
): Promise<T> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return (req.body.trim() ? JSON.parse(req.body) : {}) as T;
    }
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8').trim();
      return (text ? JSON.parse(text) : {}) as T;
    }
    if (typeof req.body === 'object') {
      return req.body as T;
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Request payload exceeds maximum allowed size (256 KB).');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function classifyAiErrorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (
    message.includes('API_KEY_INVALID') ||
    lower.includes('rejected the server api key') ||
    lower.includes('api key not valid') ||
    message.includes('401')
  ) {
    return 401;
  }
  if (
    message.includes('PERMISSION_DENIED') ||
    lower.includes('denied permission') ||
    message.includes('403')
  ) {
    return 403;
  }
  if (
    lower.includes('not configured') ||
    lower.includes('failed to initialize') ||
    lower.includes('timed out') ||
    message.includes('503') ||
    lower.includes('temporarily busy')
  ) {
    return 503;
  }
  if (message.includes('429') || lower.includes('quota')) {
    return 429;
  }
  if (
    lower.includes('network error') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  ) {
    return 502;
  }
  return 500;
}

export async function processAiChatRequest(
  body: AiChatRequestBody
): Promise<{ statusCode: number; payload: Record<string, unknown> }> {
  if (
    !body ||
    typeof body.city !== 'string' ||
    !body.city.trim() ||
    !body.preferences ||
    typeof body.preferences !== 'object' ||
    Array.isArray(body.preferences)
  ) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: 'Invalid request: city and preferences are required.',
      },
    };
  }

  const intervalMs = resolveSimulationIntervalMs(
    process.env.SIMULATION_INTERVAL_MS
  );
  const station =
    typeof body.station === 'string' &&
    body.station.trim().length > 0 &&
    body.station.trim().toLowerCase() !== 'all'
      ? body.station.trim().slice(0, 120)
      : undefined;

  const trimmedCity = body.city.trim().slice(0, 80);
  const simulatedContext = buildSimulatedCityAqiResponse(
    trimmedCity,
    classifyCpcbAqi,
    { station, intervalMs }
  );

  if (!simulatedContext) {
    return {
      statusCode: 404,
      payload: {
        success: false,
        error: `City "${trimmedCity}" is not in the AERIS AI simulated Indian city catalog.`,
        supportedCities: INDIAN_CITIES.map((c) => c.name),
      },
    };
  }

  const normalizedPreferences = normalizePreferences(
    simulatedContext.city,
    body.preferences
  );
  const history = sanitizeChatHistory(body.history, 8);
  const verification = evaluateAqiVerificationStatus(simulatedContext);
  const rawQuestion =
    typeof body.question === 'string' && body.question.trim()
      ? body.question
      : typeof body.message === 'string' && body.message.trim()
      ? body.message
      : undefined;

  try {
    const structured = await generateAerisRecommendations({
      aqiContext: simulatedContext,
      preferences: normalizedPreferences,
      userPrompt: rawQuestion ? rawQuestion.trim().slice(0, 1000) : undefined,
      history,
    });

    return {
      statusCode: 200,
      payload: {
        success: true,
        verifiedContext: {
          city: simulatedContext.city,
          station:
            simulatedContext.selectedStationName ??
            simulatedContext.stations[0]?.station ??
            null,
          primaryAqi: simulatedContext.primaryAqi,
          category: simulatedContext.category,
          lastUpdatedIso: simulatedContext.lastUpdatedIso,
          dataMode: simulatedContext.dataMode,
          dataSource: simulatedContext.dataSource,
          dataType: simulatedContext.dataType,
          isLiveVerified: verification.isLiveVerified,
          verificationNotice: verification.verificationNotice,
        },
        reply: structured.summary,
        recommendation: structured,
      },
    };
  } catch (err) {
    const message = redactSecrets(
      err instanceof Error
        ? err.message
        : 'Gemini AI recommendation request failed.'
    );
    return {
      statusCode: classifyAiErrorStatus(message),
      payload: {
        success: false,
        error: message,
      },
    };
  }
}

export async function handleServerlessAiChat(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
  endpointPath: string
): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Allow', 'POST, OPTIONS');
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, {
        success: false,
        error: `Method ${req.method ?? 'UNKNOWN'} not allowed. Use POST ${endpointPath}.`,
      });
      return;
    }

    let body: AiChatRequestBody;
    try {
      body = await readJsonBody<AiChatRequestBody>(req);
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error:
          err instanceof Error
            ? `Invalid JSON request body: ${err.message}`
            : 'Invalid JSON request body.',
      });
      return;
    }

    const result = await processAiChatRequest(body);
    sendJson(res, result.statusCode, result.payload);
  } catch (unexpectedErr) {
    const safeMsg = redactSecrets(
      unexpectedErr instanceof Error
        ? unexpectedErr.message
        : 'Unexpected server error while processing AI request.'
    );
    console.error(`Unhandled error in ${endpointPath}:`, safeMsg);
    sendJson(res, 500, {
      success: false,
      error: safeMsg,
    });
  }
}
