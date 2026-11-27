import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import aqiHandler from '../api/aqi.ts';
import communityDemoHandler from '../api/community/demo.ts';
import healthHandler from '../api/health.ts';
import impactCalculateHandler from '../api/impact/calculate.ts';
import indiaAqiHandler from '../api/india/aqi.ts';
import approximateLocationHandler from '../api/location/approximate.ts';
import { validateEmissionsPayload } from './http.ts';
import { extractClientIp } from './location.ts';

function createMockReqRes(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  body?: unknown;
}): {
  req: IncomingMessage & { body?: unknown };
  res: ServerResponse;
  getResult: () => {
    statusCode: number;
    headers: Map<string, string>;
    body: Record<string, unknown> | null;
  };
} {
  const stream = Readable.from([]) as IncomingMessage & { body?: unknown };
  stream.method = options.method ?? 'GET';
  stream.url = options.url ?? '/';
  stream.headers = options.headers ?? {};
  (stream as unknown as { socket: { remoteAddress?: string } }).socket = {
    remoteAddress: options.remoteAddress ?? '127.0.0.1',
  };
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
      headers,
      body: rawOut ? (JSON.parse(rawOut) as Record<string, unknown>) : null,
    }),
  };
}

test('serverless health, aqi, india/aqi, and community/demo endpoints return valid JSON, headers, and enforce HTTP methods', () => {
  // /api/health GET 200 & POST 405
  {
    const { req, res, getResult } = createMockReqRes({ method: 'GET', url: '/api/health' });
    healthHandler(req, res);
    const out = getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.body?.status, 'ok');
    assert.equal(out.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(out.headers.get('cache-control'), 'no-store');
  }
  {
    const { req, res, getResult } = createMockReqRes({ method: 'POST', url: '/api/health' });
    healthHandler(req, res);
    assert.equal(getResult().statusCode, 405);
  }

  // /api/aqi valid city 200 & unknown city 404
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      url: '/api/aqi?city=Delhi',
    });
    aqiHandler(req, res);
    const out = getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.body?.data_type, 'SIMULATED');
    assert.equal(out.body?.city, 'Delhi');
  }
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      url: '/api/aqi?city=UnknownCityXYZ',
    });
    aqiHandler(req, res);
    assert.equal(getResult().statusCode, 404);
  }

  // /api/india/aqi state filter & includeCityDetail
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      url: '/api/india/aqi?state=Kerala&city=Kochi&includeCityDetail=1',
    });
    indiaAqiHandler(req, res);
    const out = getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.body?.data_type, 'SIMULATED');
    assert.ok(out.body?.cityDetail);
  }

  // /api/community/demo GET 200 & DELETE 405
  {
    const { req, res, getResult } = createMockReqRes({ method: 'GET', url: '/api/community/demo' });
    communityDemoHandler(req, res);
    const out = getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(out.body?.isDemo, true);
  }
  {
    const { req, res, getResult } = createMockReqRes({ method: 'DELETE', url: '/api/community/demo' });
    communityDemoHandler(req, res);
    assert.equal(getResult().statusCode, 405);
  }
});

test('api/impact/calculate validates bounds and computes commute CO2e savings accurately', async () => {
  assert.equal(validateEmissionsPayload({ baselineMode: 'solo_car', alternativeMode: 'metro', oneWayDistanceKm: 9999, tripsPerWeek: 10 }), null);
  assert.equal(validateEmissionsPayload({ baselineMode: 'solo_car', alternativeMode: 'metro', oneWayDistanceKm: -5, tripsPerWeek: 10 }), null);

  {
    const { req, res, getResult } = createMockReqRes({ method: 'GET' });
    await impactCalculateHandler(req, res);
    assert.equal(getResult().statusCode, 405);
  }
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: { baselineMode: 'solo_car', alternativeMode: 'invalid_mode', oneWayDistanceKm: 10, tripsPerWeek: 10 },
    });
    await impactCalculateHandler(req, res);
    assert.equal(getResult().statusCode, 400);
  }
  {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: {
        baselineMode: 'solo_car',
        alternativeMode: 'metro',
        oneWayDistanceKm: 12,
        tripsPerWeek: 10,
        aqi: 220,
        pollutionSensitiveHousehold: true,
      },
    });
    await impactCalculateHandler(req, res);
    const out = getResult();
    assert.equal(out.statusCode, 200);
    assert.equal(typeof out.body?.estimatedWeeklyCo2eAvoidedKg, 'number');
    assert.ok((out.body?.estimatedWeeklyCo2eAvoidedKg as number) > 0);
    assert.equal(typeof out.body?.estimatedAnnualCo2eAvoidedKg, 'number');
  }
});

test('extractClientIp rejects spoofed non-IP headers and api/location/approximate enforces GET', async () => {
  assert.equal(
    extractClientIp({
      headers: { 'x-forwarded-for': '../../etc/passwd, evil.example.com' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never),
    null
  );
  assert.equal(
    extractClientIp({
      headers: { 'x-forwarded-for': '10.0.0.1, 49.36.128.10' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never),
    '49.36.128.10'
  );
  assert.equal(
    extractClientIp({
      headers: { 'x-real-ip': 'not-an-ip-address' },
      socket: { remoteAddress: '::1' },
    } as never),
    null
  );

  const { req, res, getResult } = createMockReqRes({
    method: 'POST',
    url: '/api/location/approximate',
  });
  await approximateLocationHandler(req, res);
  assert.equal(getResult().statusCode, 405);
});
