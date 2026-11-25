import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import {
  buildGeminiContents,
  buildGeminiModelAttempts,
  isGeminiConfigured,
  loadGeminiApiKey,
  parseGeminiJsonResponse,
} from './gemini.ts';
import {
  classifyAiErrorStatus,
  handleServerlessAiChat,
} from './handler.ts';

test('loadGeminiApiKey trims whitespace, strips wrapping quotes, and rejects placeholders', () => {
  assert.equal(loadGeminiApiKey({}), null);
  assert.equal(loadGeminiApiKey({ GEMINI_API_KEY: '   ' }), null);
  assert.equal(loadGeminiApiKey({ GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY' }), null);
  assert.equal(loadGeminiApiKey({ GEMINI_API_KEY: '"MY_GEMINI_API_KEY"' }), null);
  assert.equal(loadGeminiApiKey({ GEMINI_API_KEY: 'undefined' }), null);

  assert.equal(
    loadGeminiApiKey({ GEMINI_API_KEY: '  "AIzaSyExampleKey12345"  ' }),
    'AIzaSyExampleKey12345'
  );
  assert.equal(
    loadGeminiApiKey({ GEMINI_API_KEY: "'AIzaSyExampleKey67890'" }),
    'AIzaSyExampleKey67890'
  );
  assert.equal(
    isGeminiConfigured({ GEMINI_API_KEY: '"AIzaSyExampleKey12345"' }),
    true
  );
  assert.equal(isGeminiConfigured({ GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY' }), false);
});

test('buildGeminiModelAttempts prioritizes gemini-4-hydrogen, falls back to gemini-3.1-flash-lite, and skips deprecated overrides', () => {
  const defaults = buildGeminiModelAttempts();
  assert.deepEqual(
    defaults.map((a) => a.model),
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
  );
  assert.equal(defaults[0].thinkingLevel, 'LOW');
  assert.equal(defaults[1].thinkingLevel, 'MINIMAL');
  assert.equal(
    defaults.some((a) => a.model.includes('gemini-2.5-flash')),
    false
  );

  const withLiteOverride = buildGeminiModelAttempts(' "gemini-3.1-flash-lite" ');
  assert.deepEqual(
    withLiteOverride.map((a) => a.model),
    ['gemini-3.1-flash-lite', 'gemini-4-hydrogen']
  );
  assert.equal(withLiteOverride[0].thinkingLevel, 'MINIMAL');

  // Deprecated GEMINI_MODEL values should be ignored cleanly
  const withRetiredOverride = buildGeminiModelAttempts('gemini-2.5-flash');
  assert.deepEqual(
    withRetiredOverride.map((a) => a.model),
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
  );
  const withLegacyOverride = buildGeminiModelAttempts('gemini-2.0-flash');
  assert.deepEqual(
    withLegacyOverride.map((a) => a.model),
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
  );
});

test('classifyAiErrorStatus maps auth, permission, quota, network, and timeout errors to accurate HTTP codes', () => {
  assert.equal(
    classifyAiErrorStatus('Gemini API rejected the server API key (API_KEY_INVALID).'),
    401
  );
  assert.equal(
    classifyAiErrorStatus('Gemini API denied permission (403 PERMISSION_DENIED).'),
    403
  );
  assert.equal(
    classifyAiErrorStatus('Gemini API quota temporarily reached (429).'),
    429
  );
  assert.equal(
    classifyAiErrorStatus('Network error reaching the Gemini API from the server.'),
    502
  );
  assert.equal(
    classifyAiErrorStatus('GEMINI_API_KEY is not configured on the server.'),
    503
  );
  assert.equal(
    classifyAiErrorStatus('Gemini API timed out while generating a response.'),
    503
  );
});

test('buildGeminiContents enforces strict user/model alternation and drops trailing user retry turns', () => {
  const contents = buildGeminiContents(
    [
      // Leading assistant turn should be dropped
      { role: 'assistant', text: 'Orphaned greeting' },
      { role: 'user', text: 'First question' },
      { role: 'assistant', text: 'First answer' },
      // Consecutive user turns + trailing user turn (as happens on Retry after error)
      { role: 'user', text: 'Retry question part 1' },
      { role: 'user', text: 'Retry question part 2' },
    ],
    '{"userQuestion":"Retry question part 2"}'
  );

  assert.equal(contents.length, 3);
  assert.deepEqual(
    contents.map((c) => c.role),
    ['user', 'model', 'user']
  );
  assert.equal(contents[0].parts[0].text, 'First question');
  assert.equal(contents[1].parts[0].text, 'First answer');
  assert.equal(contents[2].parts[0].text, '{"userQuestion":"Retry question part 2"}');
});

test('parseGeminiJsonResponse handles plain JSON, markdown code fences, and prose wrappers', () => {
  const sample = {
    summary: 'Stay indoors during high winter smog.',
    currentRisk: 'Very Poor (310)',
    recommendedActions: ['Run HEPA purifier'],
    avoidActions: ['Avoid outdoor jogging'],
    indoorAdvice: ['Keep windows sealed'],
    commuteAdvice: ['Use Metro rail'],
    dailySchedule: {
      morning: 'Indoor workout',
      afternoon: 'Brief check',
      evening: 'Close vents',
    },
    reasoning: 'Simulated PM2.5 is elevated.',
    sourceReferences: ['AERIS AI Simulation Engine'],
    dataLimitations: 'Simulated data only.',
  };

  assert.equal(parseGeminiJsonResponse(JSON.stringify(sample)).summary, sample.summary);
  assert.equal(
    parseGeminiJsonResponse(`\`\`\`json\n${JSON.stringify(sample)}\n\`\`\``).summary,
    sample.summary
  );
  assert.equal(
    parseGeminiJsonResponse(`Here is the JSON:\n${JSON.stringify(sample)}\nThanks!`).summary,
    sample.summary
  );
  assert.throws(() => parseGeminiJsonResponse(''), /empty response/i);
  assert.throws(() => parseGeminiJsonResponse('not valid json'), /unreadable response/i);
});

function createMockReqRes(options: {
  method: string;
  body?: unknown;
  rawStreamBody?: string;
}): {
  req: IncomingMessage & { body?: unknown };
  res: ServerResponse;
  getResult: () => { statusCode: number; body: Record<string, unknown> | null };
} {
  const stream = Readable.from(
    options.rawStreamBody !== undefined ? [Buffer.from(options.rawStreamBody)] : []
  ) as IncomingMessage & { body?: unknown };
  stream.method = options.method;
  if (options.body !== undefined) {
    stream.body = options.body;
  }

  let statusCode = 200;
  let ended = false;
  let rawOut = '';
  const headers = new Map<string, string>();
  const res = {
    get writableEnded() {
      return ended;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader(key: string, val: string) {
      headers.set(key.toLowerCase(), String(val));
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) rawOut += chunk.toString();
      ended = true;
      return this;
    },
  } as unknown as ServerResponse;

  return {
    req: stream,
    res,
    getResult: () => ({
      statusCode,
      body: rawOut ? (JSON.parse(rawOut) as Record<string, unknown>) : null,
    }),
  };
}

test('handleServerlessAiChat returns accurate HTTP error codes for invalid methods, payloads, cities, and missing GEMINI_API_KEY', async () => {
  // 1. 405 on GET
  {
    const { req, res, getResult } = createMockReqRes({ method: 'GET' });
    await handleServerlessAiChat(req, res, '/api/ai/recommendations');
    const out = getResult();
    assert.equal(out.statusCode, 405);
    assert.equal(out.body?.success, false);
  }

  // 2. 400 on malformed JSON stream
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      rawStreamBody: '{invalid-json',
    });
    await handleServerlessAiChat(req, res, '/api/ai/recommendations');
    const out = getResult();
    assert.equal(out.statusCode, 400);
    assert.match(String(out.body?.error), /Invalid JSON/i);
  }

  // 3. 400 on missing city / preferences
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: { city: 'Delhi' },
    });
    await handleServerlessAiChat(req, res, '/api/ai/recommendations');
    assert.equal(getResult().statusCode, 400);
  }

  // 4. 404 on unsupported city
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: { city: 'Atlantis', preferences: { commuteMode: 'metro' } },
    });
    await handleServerlessAiChat(req, res, '/api/ai/recommendations');
    assert.equal(getResult().statusCode, 404);
  }

  // 5. 503 when GEMINI_API_KEY is unset (restoring original key cleanly afterward)
  const hadKey = Object.prototype.hasOwnProperty.call(process.env, 'GEMINI_API_KEY');
  const savedKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: {
        city: 'Delhi',
        preferences: { commuteMode: 'metro', pollutionSensitiveHousehold: true },
        message: 'Is outdoor exercise safe?',
      },
    });
    await handleServerlessAiChat(req, res, '/api/ai/chat');
    const out = getResult();
    assert.equal(out.statusCode, 503);
    assert.match(String(out.body?.error), /GEMINI_API_KEY is not configured/i);
  } finally {
    if (hadKey && savedKey !== undefined) {
      process.env.GEMINI_API_KEY = savedKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});
