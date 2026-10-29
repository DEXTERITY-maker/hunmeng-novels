import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequestHttp } from '../src/lib/novel-requests/http.ts';
import { identifySource } from '../src/lib/novel-requests/core.ts';
import { fixtureAdapter, FIXTURE_PROVIDER_ARCHIVE } from '../src/lib/novel-requests/prototype-fixtures.ts';

const origin = 'https://hunmeng-novel.test';
const url = 'https://fiction-archive.test/work/4242';
function setup() {
  const records = [];
  const dependencies = {
    identity: { verify: async token => token === 'valid-token' ? { userId: 'fixture-user', role: 'user', active: true } : null },
    allowedAdapters: [fixtureAdapter],
    sources: { recognize: async value => ({ source: identifySource(value, [fixtureAdapter]), metadata: {}, provenance: { provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: '1', policyId: 'test' } }) },
    catalog: { works: async () => [] },
    rateLimiter: { check: async () => ({ allowed: true }) },
    store: { submitAtomically: async record => {
      const old = records.find(item => item.key === record.idempotencyKey);
      if (old) return old.record.fingerprint === record.fingerprint ? { kind: 'replay', record: old.record } : { kind: 'conflict', existingRequestId: old.record.id };
      const stored = { ...record, id: 'request-1', createdAt: '2026-10-28T00:00:00Z' };
      records.push({ key: record.idempotencyKey, record: stored });
      return { kind: 'new', record: stored };
    } },
  };
  return { config: { allowedOrigins: [origin], dependencies }, records };
}
function req({ body = JSON.stringify({ url }), headers = {}, method = 'POST' } = {}) {
  return new Request('https://hunmeng-novel.test/api/novel-requests', {
    method, headers: { origin, authorization: 'Bearer valid-token', 'content-type': 'application/json', 'idempotency-key': 'request-key-1', ...headers },
    ...(method === 'GET' ? {} : { body }),
  });
}
async function result(request, config) { const response = await handleRequestHttp(request, config); return { response, body: await response.json() }; }

test('HTTP submission goes through the real handler; replay and conflict are preserved', async () => {
  const { config, records } = setup();
  const first = await result(req(), config);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.deduplicated, 'new');
  assert.equal(first.body.rights, 'unverified');
  assert.equal(first.response.headers.get('cache-control'), 'no-store');
  assert.equal(first.response.headers.get('access-control-allow-origin'), null);
  assert.equal(JSON.stringify(first.body).includes('valid-token'), false);
  assert.equal((await result(req(), config)).body.deduplicated, 'replay');
  assert.equal((await result(req({ body: JSON.stringify({ url, note: 'different' }) }), config)).response.status, 409);
  assert.equal(records.length, 1);
});

test('transport rejects unsupported methods, origins, credentials, media and keys before storage', async () => {
  const { config, records } = setup();
  const cases = [
    [req({ method: 'GET' }), 405],
    [req({ headers: { origin: 'https://attacker.test' } }), 403],
    [req({ headers: { authorization: '' } }), 401],
    [req({ headers: { authorization: 'Bearer invalid' } }), 401],
    [req({ headers: { 'content-type': 'text/plain' } }), 415],
    [req({ headers: { 'idempotency-key': 'short' } }), 400],
    [req({ body: JSON.stringify({ url, idempotencyKey: 'attacker-key' }) }), 400],
    [req({ body: JSON.stringify({ url, role: 'admin' }) }), 400],
  ];
  for (const [request, status] of cases) assert.equal((await handleRequestHttp(request, config)).status, status);
  assert.equal(records.length, 0);
  assert.equal((await handleRequestHttp(req(), { ...config, allowedOrigins: [] })).status, 503);
  assert.equal((await handleRequestHttp(req(), { ...config, allowedOrigins: ['https://hunmeng-novel.test/path'] })).status, 503);
});

test('bounds actual UTF-8 bytes, rejects invalid JSON and forged content length', async () => {
  const { config, records } = setup();
  for (const request of [req({ body: '{' }), req({ body: '[]' }), req({ headers: { 'content-length': 'bad' } })])
    assert.equal((await handleRequestHttp(request, config)).status, 400);
  assert.equal((await handleRequestHttp(req({ headers: { 'content-length': '32769' } }), config)).status, 413);
  assert.equal((await handleRequestHttp(req({ body: JSON.stringify({ url, note: 'Я'.repeat(17000) }), headers: { 'content-length': '2' } }), config)).status, 413);
  const badUtf8 = new Request('https://hunmeng-novel.test/api/novel-requests', { method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json', 'idempotency-key': 'request-key-1' }, body: new Uint8Array([0xff]) });
  assert.equal((await handleRequestHttp(badUtf8, config)).status, 400);
  assert.equal(records.length, 0);
});

test('dependency failures fail closed and quota retry is conveyed safely', async () => {
  const { config, records } = setup();
  config.dependencies.rateLimiter = { check: async () => ({ allowed: false, retryAfterSeconds: 60 }) };
  const limited = await result(req(), config);
  assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get('retry-after'), '60');
  config.dependencies.identity = null;
  assert.equal((await handleRequestHttp(req(), config)).status, 503);
  assert.equal(records.length, 0);
});
