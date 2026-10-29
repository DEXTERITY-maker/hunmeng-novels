import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerSupabaseIdentity } from '../src/lib/novel-requests/server-supabase-auth.ts';
import { createIsolatedNovelRequestRuntime } from '../src/lib/novel-requests/isolated-runtime.ts';

const fakeServer = {
  supabaseUrl: 'https://fixture.supabase.co',
  supabasePublishableKey: 'sb_publishable_test_fixture_not_a_real_key',
  requesterReferenceSecret: new Uint8Array(32).fill(5),
  allowedOrigins: ['https://hunmeng-novel.ru'],
  database: { query: async () => { throw new Error('database should not be called'); } },
  sources: { recognize: async () => null },
  allowedAdapters: [{ hosts: ['fiction.test'], identify: () => null }],
  catalog: { works: async () => [] },
  rateLimiter: { check: async () => ({ allowed: true }) },
};

test('server-side Supabase identity refuses non-project URLs and missing keys', () => {
  for (const url of [
    'http://fixture.supabase.co',
    'https://user:pass@fixture.supabase.co',
    'https://fixture.supabase.co/secret',
    'https://fixture.supabase.co.evil.test',
    'https://localhost',
  ]) assert.throws(() => createServerSupabaseIdentity(url, fakeServer.supabasePublishableKey));
  assert.throws(() => createServerSupabaseIdentity(fakeServer.supabaseUrl, ''));
});

test('runtime is server-only, disconnected and rejects absent dependencies', async () => {
  for (const key of ['database', 'sources', 'catalog', 'rateLimiter', 'allowedAdapters', 'allowedOrigins']) {
    assert.throws(() => createIsolatedNovelRequestRuntime({ ...fakeServer, [key]: null }), key);
  }
  const handler = createIsolatedNovelRequestRuntime(fakeServer);
  const response = await handler(new Request('https://hunmeng-novel.ru/api/novel-requests', {
    method: 'POST',
    headers: { origin: 'https://hunmeng-novel.ru', authorization: 'Bearer invalid', 'content-type': 'application/json', 'idempotency-key': 'fixture-key' },
    body: JSON.stringify({url:'https://fiction.test/42'}),
  }));
  // No real token is used and there is no deployable API endpoint. The test
  // intentionally avoids network access; the real getUser(jwt) belongs to
  // a separate owner-approved Supabase staging integration suite.
  assert.ok([401,503].includes(response.status));
});
