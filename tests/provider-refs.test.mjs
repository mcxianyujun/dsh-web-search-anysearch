// Verify AnySearchProvider honors credential-ref overrides (baseURL,
// maxResults, zone, language, format) by stubbing fetch and asserting the
// outgoing request. No real network.
import assert from 'node:assert/strict';
import { AnySearchProvider, ANYSEARCH_REF_BASE_URL } from '../lib/index.mjs';

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
  return new Response(
    JSON.stringify({
      code: 0,
      data: { results: [{ url: 'https://r.example/x', title: 'T', snippet: 'S' }] },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};

const provider = new AnySearchProvider(() => ({
  apiKey: 'test-key',
  apiKeyEnv: 'ANYSEARCH_API_KEY',
  baseURL: 'https://api.anysearch.com',
  maxResults: 10,
  format: 'json',
  resolveApiKey: async () => undefined,
  resolveConfigRef: async (ref) => {
    if (ref === ANYSEARCH_REF_BASE_URL) return 'https://override.example/';
    if (ref === 'ANYSEARCH_MAX_RESULTS') return '5';
    if (ref === 'ANYSEARCH_ZONE') return 'cn';
    if (ref === 'ANYSEARCH_LANGUAGE') return 'zh-CN';
    if (ref === 'ANYSEARCH_FORMAT') return 'markdown';
    return undefined;
  },
}));

const result = await provider.search({ query: '长沙天气', maxResults: 8 });

assert.equal(calls.length, 1);
const call = calls[0];
assert.equal(call.url, 'https://override.example/v1/search', 'baseURL ref must override the default');
assert.equal(call.body.query, '长沙天气');
assert.equal(call.body.max_results, 5, 'maxResults ref must override the request bound');
assert.equal(call.body.zone, 'cn');
assert.equal(call.body.language, 'zh-CN');
assert.equal(call.body.format, 'markdown');
assert.equal(call.headers.authorization, 'Bearer test-key');
assert.equal(result.sources[0].url, 'https://r.example/x');
console.log('OK: credential-ref overrides are honored (url, max_results, zone, language, format, auth header)');
