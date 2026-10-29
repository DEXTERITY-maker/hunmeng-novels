import test from 'node:test';
import assert from 'node:assert/strict';
import { listModerationQueue, submitModerationDecision } from '../src/lib/novel-requests/moderation.ts';

const actor = '40000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const actorRef = 'a'.repeat(64);
const body = { requestId, expectedVersion: 1, to: 'review', reason: 'Test review' };
function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    identity: { verify: async token => token === 'valid' ? { userId: actor, role: 'user', active: true } : null },
    actorReferences: { derive: async () => actorRef },
    limiter: { check: async () => ({ allowed: true }) },
    database: { query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('request_moderate')) return { rows: [{ result: { kind: 'updated', status: 'review', version: 2 } }] };
      return { rows: [{ id: requestId, status: 'submitted', version: 1, created_at: '2026-10-29 09:01:02.123456+00',
        submitted_url: 'https://fiction.test/work/1', client_note: 'note', hints: { originalTitle: 'hint' },
        metadata: { originalTitle: 'metadata' }, matches: [], requester_ref: 'must-not-leak' }] };
    } },
    ...overrides,
  };
}

test('verified user and server-derived actor reference reach the restricted decision call', async () => {
  const deps = dependencies();
  const result = await submitModerationDecision('valid', body, deps);
  assert.deepEqual(result, { status: 200, body: { status: 'review', version: 2 } });
  assert.deepEqual(deps.calls[0].values, [actor, actorRef, requestId, 1, 'review', 'Test review']);
  assert.equal(JSON.stringify(result).includes(actor), false);
});

test('queue projects permitted fields and preserves microsecond cursor', async () => {
  const deps = dependencies();
  const first = await listModerationQueue('valid', {}, deps);
  assert.equal(first.status, 200);
  assert.equal(JSON.stringify(first).includes('must-not-leak'), false);
  const after = { createdAt: first.body.items[0].createdAt, id: requestId };
  await listModerationQueue('valid', { limit: 1, after }, deps);
  assert.deepEqual(deps.calls[1].values, [actor, '2026-10-29 09:01:02.123456+00', requestId, 1]);
});

test('auth, dependency and limiter failures never call the database', async () => {
  const cases = [
    [dependencies(), null, 401], [dependencies(), 'invalid', 401],
    [dependencies({ identity: { verify: async () => ({ userId: actor, active: false }) } }), 'valid', 403],
    [dependencies({ identity: { verify: async () => { throw Error('down'); } } }), 'valid', 503],
    [dependencies({ actorReferences: null }), 'valid', 503],
    [dependencies({ limiter: { check: async () => ({ allowed: false }) } }), 'valid', 429],
    [dependencies({ limiter: { check: async () => { throw Error('down'); } } }), 'valid', 503],
  ];
  for (const [deps, token, status] of cases) {
    assert.equal((await submitModerationDecision(token, body, deps)).status, status);
    assert.equal(deps.calls.length, 0);
  }
});

test('client cannot forge actor, role or hidden conversion transitions', async () => {
  for (const input of [
    { ...body, actorId: actor }, { ...body, role: 'admin' }, { ...body, to: 'converted' },
    { ...body, to: 'draft' }, { ...body, reason: '  ' }, { ...body, expectedVersion: 0 },
    { ...body, expectedVersion: 2147483647 }, { ...body, requestId: 'invalid' },
  ]) {
    const deps = dependencies();
    assert.equal((await submitModerationDecision('valid', input, deps)).status, 400);
    assert.equal(deps.calls.length, 0);
  }
  for (const input of [{ limit: 51 }, { after: { id: requestId } }, { admin: true }, { after: { id: requestId, createdAt: 'invalid' } }])
    assert.equal((await listModerationQueue('valid', input, dependencies())).status, 400);
});

test('database authorization, conflicts and failures have bounded responses', async () => {
  const query = result => dependencies({ database: { query: async () => result } });
  assert.deepEqual(await submitModerationDecision('valid', body, query({ rows: [{ result: { kind: 'conflict', version: 3, private: 'secret' } }] })),
    { status: 409, body: { error: 'version-conflict', version: 3 } });
  assert.equal((await submitModerationDecision('valid', body, query({ rows: [{ result: { kind: 'not-found' } }] }))).status, 404);
  assert.equal((await submitModerationDecision('valid', body, query({ rows: [{ result: { kind: 'updated', status: 'converted', version: 2 } }] }))).status, 503);
  const denied = dependencies({ database: { query: async () => { throw Object.assign(Error('private database message'), { code: '42501' }); } } });
  assert.deepEqual(await listModerationQueue('valid', {}, denied), { status: 403, body: { error: 'not-authorized' } });
  const failed = dependencies({ database: { query: async () => { throw Error('secret db details'); } } });
  assert.deepEqual(await submitModerationDecision('valid', body, failed), { status: 503, body: { error: 'dependency-unavailable' } });
});
