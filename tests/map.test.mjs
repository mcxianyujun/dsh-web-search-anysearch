/**
 * Minimal unit tests for the pure mapping/error helpers of
 * dsh-web-search-anysearch. Run with `npm test` / `pnpm test`.
 * No network access is required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anySearchErrorDetail,
  clampMaxResults,
  mapAnySearchResponse,
} from '../lib/index.mjs';

/** A realistic AnySearch envelope captured from the live API. */
const LIVE_SHAPE = {
  code: 0,
  message: 'Success.',
  request_id: '3f729660-b99a-49d8-8c6c-607041a519bc',
  data: {
    results: [
      {
        title: '【长沙明天天气预报】长沙明天天气_长沙天气预报7天查询_天气网',
        url: 'https://m.tianqi.com/changshaxian/mingtian/',
        snippet: '长沙天气预报 # 长沙明天天气预报 长沙 [切换] 11:01 更新 33°C 多云 29~37°C',
        content: 'long page body…',
      },
      {
        title: '另一篇',
        url: 'https://example.com/other',
        snippet: 'snippet two',
        content: '…',
      },
    ],
    metadata: { total_results: 2, search_time_ms: 1 },
  },
};

test('maps a well-formed envelope to sources', () => {
  const result = mapAnySearchResponse(LIVE_SHAPE);
  assert.equal(result.truncated, false);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources[0], {
    url: 'https://m.tianqi.com/changshaxian/mingtian/',
    title: '【长沙明天天气预报】长沙明天天气_长沙天气预报7天查询_天气网',
    snippet: '长沙天气预报 # 长沙明天天气预报 长沙 [切换] 11:01 更新 33°C 多云 29~37°C',
  });
});

test('dedupes sources by url', () => {
  const envelope = {
    code: 0,
    data: {
      results: [
        { url: 'https://a.example/x', title: 'A', snippet: 's' },
        { url: 'https://a.example/x', title: 'A copy', snippet: 't' },
        { url: 'https://b.example/y', title: 'B' },
      ],
    },
  };
  const result = mapAnySearchResponse(envelope);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].title, 'A');
});

test('drops entries without a usable url', () => {
  const envelope = {
    code: 0,
    data: {
      results: [
        { url: '', title: 'no url', snippet: 's' },
        { title: 'no url either' },
        null,
        { url: 'https://ok.example/', title: 'OK', snippet: 's' },
      ],
    },
  };
  const result = mapAnySearchResponse(envelope);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, 'https://ok.example/');
});

test('empty results is a legitimate empty outcome', () => {
  assert.deepEqual(mapAnySearchResponse({ code: 0, data: { results: [] } }), {
    sources: [],
    truncated: false,
  });
  assert.deepEqual(mapAnySearchResponse({ code: 0 }), { sources: [], truncated: false });
});

test('throws on non-zero application code even with HTTP-shaped envelope', () => {
  assert.throws(
    () => mapAnySearchResponse({ code: -1, message: 'Query is required.', request_id: 'x' }),
    /Query is required\./,
  );
  assert.throws(() => mapAnySearchResponse({ code: 7 }), /AnySearch API error \(code 7\)/);
});

test('throws on malformed envelopes', () => {
  assert.throws(() => mapAnySearchResponse(null), /unexpected response body/);
  assert.throws(() => mapAnySearchResponse(42), /unexpected response body/);
  assert.throws(
    () => mapAnySearchResponse({ code: 0, data: { results: 'nope' } }),
    /results is not an array/,
  );
});

test('error detail prefers the server message', () => {
  assert.equal(
    anySearchErrorDetail(JSON.stringify({ code: -1, message: 'Invalid API key.' }), 401),
    'Invalid API key.',
  );
  assert.equal(anySearchErrorDetail(JSON.stringify({ code: -1, message: 'Query is required.' }), 400), 'Query is required.');
});

test('error detail falls back per status without inventing claims', () => {
  assert.equal(anySearchErrorDetail('<html>not json</html>', 401), 'AnySearch authentication failed (HTTP 401)');
  assert.equal(anySearchErrorDetail('', 403), 'AnySearch authentication failed (HTTP 403)');
  assert.equal(anySearchErrorDetail('', 429), 'AnySearch request rate limited (HTTP 429)');
  assert.equal(anySearchErrorDetail('', 500), 'AnySearch API error (HTTP 500)');
  assert.equal(anySearchErrorDetail('', 502), 'AnySearch API error (HTTP 502)');
});

test('clampMaxResults bounds into 1..20', () => {
  assert.equal(clampMaxResults(8, 10), 8);
  assert.equal(clampMaxResults(50, 10), 20);
  assert.equal(clampMaxResults(0, 10), 1);
  assert.equal(clampMaxResults(-3, 10), 1);
  assert.equal(clampMaxResults(undefined, 10), 10);
  assert.equal(clampMaxResults(Number.NaN, 10), 10);
  assert.equal(clampMaxResults(2.9, 10), 2);
});
