import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNovelRequest, createRequesterReferenceDeriver } from '../src/lib/novel-requests/handler.ts';
import { identifySource } from '../src/lib/novel-requests/core.ts';
import {
  FIXTURE_PROVIDER_ARCHIVE,
  fixtureAdapter,
  fixtureCatalog,
  fixtureChapters,
} from '../src/lib/novel-requests/prototype-fixtures.ts';

const archiveUrl = 'https://fiction-archive.test/work/4242';
const referenceDeriver = createRequesterReferenceDeriver(new Uint8Array(32).fill(7)); // fixture only

function makeRegistry(metadata = {}) {
  return {
    recognize: async url => {
      const source = identifySource(url, [fixtureAdapter]);
      if (!source) return null;
      return {
        source,
        metadata,
        provenance: { provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: 'fixture-adapter-1', policyId: 'fixture-policy' },
      };
    },
  };
}

function makeIdentity(map = {}) {
  return {
    verify: async token => {
      if (token === 'verifier-error') throw new Error('identity backend down');
      const actor = map[token ?? 'null'];
      return actor ?? null;
    },
  };
}

const activeUser = { userId: 'user-1', role: 'user', active: true };
const defaultIdentityMap = { good: activeUser, inactive: { ...activeUser, active: false } };

function makeLimiter({ allowed = true, retryAfterSeconds, fail = false } = {}) {
  const calls = [];
  return {
    calls,
    check: async bucket => {
      calls.push(bucket);
      if (fail) throw new Error('limiter down');
      return retryAfterSeconds ? { allowed, retryAfterSeconds } : { allowed };
    },
  };
}

function makeCatalog({ fail = false, works = fixtureCatalog } = {}) {
  return {
    works: async () => {
      if (fail) throw new Error('catalog down');
      return works;
    },
  };
}

function makeStore({ existing = [], failFind = false, failCreate = false } = {}) {
  const entries = existing.map(entry => ({ ...entry }));
  const created = [];
  return {
    created,
    submitAtomically: async record => {
      if (failFind || failCreate) throw new Error('store down');
      const keyed = entries.find(e => e.requesterRef === record.requesterRef && e.key === record.idempotencyKey);
      if (keyed) return keyed.record.fingerprint === record.fingerprint
        ? {kind: 'replay', record: keyed.record} : {kind: 'conflict', existingRequestId: keyed.record.id};
      const active = entries.find(e => e.requesterRef === record.requesterRef && e.record.status === 'submitted' && e.record.source.provider === record.source.provider && e.record.source.externalId === record.source.externalId);
      if (active) return {kind: 'active-request', record: active.record};
      const stored = { ...record, id: `req-${created.length + 1}`, createdAt: '2026-10-28T10:00:00.000Z' };
      created.push(stored);
      entries.push({ key: record.idempotencyKey, requesterRef: record.requesterRef, record: stored });
      return {kind: 'new', record: stored};
    },
  };
}

const validBody = {
  url: archiveUrl,
  note: 'fixture note',
  idempotencyKey: 'idem-key-0001',
  clientHints: { originalTitle: 'A hinted title' },
};

function makeDeps(overrides = {}) {
  return {
    identity: makeIdentity(defaultIdentityMap),
    requesterReferences: referenceDeriver,
    allowedAdapters: [fixtureAdapter],
    sources: makeRegistry({
      originalTitle: 'The Lantern of Ninth Street',
      authors: ['A. Marlowe'],
      chapterTitles: fixtureChapters.map(chapter => ({ number: chapter.number, title: chapter.title })),
    }),
    catalog: makeCatalog(),
    rateLimiter: makeLimiter(),
    store: makeStore(),
    ...overrides,
  };
}

async function call(overrides = {}, input = {}) {
  const deps = makeDeps(overrides);
  const result = await handleNovelRequest(
    { token: 'good', body: validBody, clientIpHash: 'ip-hash-1', ...input },
    deps,
  );
  return { result, deps };
}

test('valid request is accepted with advisory matches and unverified rights', async () => {
  const { result } = await call();
  assert.equal(result.status, 201);
  assert.equal(result.body.status, 'submitted');
  assert.equal(result.body.deduplicated, 'new');
  assert.equal(result.body.rights, 'unverified');
  assert.equal(result.body.provisional, true);
  assert.equal(result.body.algorithmVersion, 'requests-match-v1');
  assert.ok(result.body.matches.length >= 1);
  assert.equal(result.body.matches[0].kind, 'exact');
});

test('missing, invalid, inactive and unavailable identity fail closed', async () => {
  const missingToken = await call({}, { token: null });
  assert.equal(missingToken.result.status, 401);
  const unknownToken = await call({}, { token: 'unknown' });
  assert.equal(unknownToken.result.status, 401);
  const inactive = await call({}, { token: 'inactive' });
  assert.equal(inactive.result.status, 403);
  const verifierDown = await call({}, { token: 'verifier-error' });
  assert.equal(verifierDown.result.status, 503);
  assert.equal(verifierDown.result.body.error, 'dependency-unavailable');
});

test('unconfigured dependencies fail closed instead of allowing the request', async () => {
  for (const key of ['identity', 'requesterReferences', 'sources', 'allowedAdapters', 'catalog', 'rateLimiter', 'store']) {
    const deps = makeDeps({ [key]: null });
    const result = await handleNovelRequest({ token: 'good', body: validBody }, deps);
    assert.equal(result.status, 503, `${key} must fail closed`);
    assert.equal(result.body.error, 'dependency-unavailable');
  }
});

test('invalid bodies are rejected before any store write', async () => {
  const cases = [
    null,
    [],
    'text',
    { ...validBody, url: 'not-a-url' },
    { ...validBody, url: 'http://fiction-archive.test/work/4242' },
    { ...validBody, idempotencyKey: 'short' },
    { ...validBody, note: 'x'.repeat(2001) },
    { ...validBody, clientHints: { unknownHint: 'x' } },
    { ...validBody, clientHints: { chapterTitles: [{ number: 0, title: 'bad' }] } },
  ];
  for (const body of cases) {
    const { result, deps } = await call({}, { body });
    assert.equal(result.status, 400, `body must be rejected: ${JSON.stringify(body)?.slice(0, 60)}`);
    assert.equal(deps.store.created.length, 0);
  }
});

test('client cannot set requester, role, status, rights, matches or fingerprint', async () => {
  const forbidden = [
    'requesterId',
    'requester_id',
    'role',
    'status',
    'rights',
    'verifiedRights',
    'matches',
    'fingerprint',
    'published',
    'userId',
  ];
  for (const field of forbidden) {
    const { result, deps } = await call({}, { body: { ...validBody, [field]: 'injected' } });
    assert.equal(result.status, 400, `${field} must be rejected`);
    assert.equal(result.body.error, 'unexpected-field');
    assert.equal(deps.store.created.length, 0);
  }
});

test('unsupported host and unsupported path are rejected', async () => {
  const unsupported = await call({}, { body: { ...validBody, url: 'https://unknown-source.test/work/1' } });
  assert.equal(unsupported.result.status, 400);
  assert.equal(unsupported.result.body.error, 'unsupported-url');
  const badPath = await call({}, { body: { ...validBody, url: 'https://fiction-archive.test/series/4242' } });
  assert.equal(badPath.result.status, 400);
  assert.equal(badPath.result.body.error, 'unsupported-url');
});

test('same idempotency key with same body replays the first result', async () => {
  const deps = makeDeps();
  const first = await handleNovelRequest({ token: 'good', body: validBody }, deps);
  const second = await handleNovelRequest({ token: 'good', body: validBody }, deps);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.deduplicated, 'replay');
  assert.equal(second.body.requestId, first.body.requestId);
  assert.equal(deps.store.created.length, 1);
});

test('same idempotency key with different content is a conflict, not a replay', async () => {
  const deps = makeDeps();
  const first = await handleNovelRequest({ token: 'good', body: validBody }, deps);
  const conflict = await handleNovelRequest(
    { token: 'good', body: { ...validBody, note: 'different note' } },
    deps,
  );
  assert.equal(first.status, 201);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'idempotency-key-reused');
  assert.equal(deps.store.created.length, 1);
});

test('active request for the same source is acknowledged without a second row', async () => {
  const deps = makeDeps();
  await handleNovelRequest({ token: 'good', body: validBody }, deps);
  const second = await handleNovelRequest(
    { token: 'good', body: { ...validBody, idempotencyKey: 'idem-key-0002' } },
    deps,
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.deduplicated, 'active-request');
  assert.equal(deps.store.created.length, 1);
});

test('rate limiting denies with retry-after and fails closed when unavailable', async () => {
  const limited = makeLimiter({ allowed: false, retryAfterSeconds: 120 });
  const denied = await call({ rateLimiter: limited });
  assert.equal(denied.result.status, 429);
  assert.equal(denied.result.body.error, 'rate-limited');
  assert.equal(denied.result.body.retryAfterSeconds, 120);

  const broken = await call({ rateLimiter: makeLimiter({ fail: true }) });
  assert.equal(broken.result.status, 503);
  assert.equal(broken.result.body.error, 'dependency-unavailable');
});

test('storage and catalog failures fail closed and never claim success', async () => {
  const readFailure = await call({ store: makeStore({ failFind: true }) });
  assert.equal(readFailure.result.status, 503);
  assert.equal(readFailure.result.body.error, 'storage-unavailable');

  const writeFailure = await call({ store: makeStore({ failCreate: true }) });
  assert.equal(writeFailure.result.status, 503);
  assert.equal(writeFailure.result.body.error, 'storage-unavailable');

  const catalogFailure = await call({ catalog: makeCatalog({ fail: true }) });
  assert.equal(catalogFailure.result.status, 503);
  assert.equal(catalogFailure.result.body.error, 'dependency-unavailable');
});

test('client hints never become match evidence', async () => {
  const deps = makeDeps({ sources: makeRegistry({}) });
  const result = await handleNovelRequest(
    {
      token: 'good',
      body: {
        // Different external id: catalog has no exact identity for it, so only
        // adapter metadata could produce a match - and there is none.
        url: 'https://fiction-archive.test/work/9999',
        note: '',
        idempotencyKey: 'idem-key-0003',
        clientHints: {
          originalTitle: 'The Lantern of Ninth Street',
          authors: ['A. Marlowe'],
          chapterTitles: fixtureChapters.map(chapter => ({ number: chapter.number, title: chapter.title })),
        },
      },
    },
    deps,
  );
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.matches, []);
  const stored = deps.store.created[0];
  assert.deepEqual(stored.hints.originalTitle, 'The Lantern of Ninth Street');
  assert.deepEqual(stored.adapterMetadata, {});
});

test('response is a projection: no tokens, user ids, fingerprints, hints or foreign data', async () => {
  const { result, deps } = await call();
  assert.equal(result.status, 201);
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ['userId', 'user-1', 'token', 'requesterRef', 'fingerprint', 'hints', 'adapterMetadata', 'provenance', 'ip-hash-1']) {
    assert.ok(!serialized.includes(forbidden), `response must not include ${forbidden}`);
  }
  const allowedKeys = ['requestId', 'status', 'deduplicated', 'matches', 'rights', 'algorithmVersion', 'provisional'];
  assert.deepEqual(Object.keys(result.body).sort(), allowedKeys.sort());
  const stored = deps.store.created[0];
  assert.match(stored.requesterRef, /^[0-9a-f]{64}$/);
  assert.notEqual(stored.requesterRef, 'user-1');
  assert.equal(await referenceDeriver.derive('user-1'), stored.requesterRef);
  assert.equal(stored.requesterId, 'user-1');
  assert.deepEqual(stored.hints, validBody.clientHints);
  assert.equal(stored.note, 'fixture note');
  assert.ok(stored.adapterMetadata.originalTitle);
});

test('another user cannot influence or read someone else request', async () => {
  const otherRef = await referenceDeriver.derive('user-2');
  const otherRecord = {
    id: 'req-other',
    requesterRef: otherRef,
    source: { provider: FIXTURE_PROVIDER_ARCHIVE, externalId: '4242', url: archiveUrl },
    fingerprint: 'f'.repeat(64),
    hints: {},
    adapterMetadata: {},
    matches: [],
    status: 'submitted',
    createdAt: '2026-10-28T09:00:00.000Z',
  };
  const store = makeStore({ existing: [{ key: 'someone-else-key', requesterRef: otherRef, record: otherRecord }] });
  const { result } = await call({ store });
  assert.equal(result.status, 201);
  assert.notEqual(result.body.requestId, 'req-other');
  assert.equal(store.created.length, 1);
});

test('requester pseudonyms require a secret, are stable and differ by key and identity', async () => {
  assert.throws(() => createRequesterReferenceDeriver(new Uint8Array(31)));
  const key = new Uint8Array(32).fill(3);
  const first = createRequesterReferenceDeriver(key);
  key.fill(9); // Mutating caller-owned bytes must not rotate an active deriver.
  const stable = await first.derive('user-1');
  assert.equal(stable, await createRequesterReferenceDeriver(new Uint8Array(32).fill(3)).derive('user-1'));
  assert.notEqual(stable, await createRequesterReferenceDeriver(new Uint8Array(32).fill(4)).derive('user-1'));
  assert.notEqual(stable, await first.derive('user-2'));
  assert.match(stable, /^[0-9a-f]{64}$/);
  await assert.rejects(first.derive(''));
});

test('missing or invalid requester derivation fails closed before storing', async () => {
  for (const requesterReferences of [{ derive: async () => { throw new Error('down'); } }, { derive: async () => 'bad' }]) {
    const { result, deps } = await call({ requesterReferences });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'dependency-unavailable');
    assert.equal(deps.store.created.length, 0);
  }
});

test('oversized payload is rejected', async () => {
  const bigHints = {
    alternativeTitles: Array.from({ length: 50 }, (_, index) => `${index}-${'x'.repeat(240)}`),
    authors: Array.from({ length: 50 }, (_, index) => `${index}-${'y'.repeat(240)}`),
  };
  const { result } = await call({}, { body: { ...validBody, clientHints: bigHints } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'payload-too-large');
});

test('IP bucket denial also returns rate-limited', async () => {
  const limiter = {
    calls: [],
    check: async bucket => {
      limiter.calls.push(bucket);
      return bucket.startsWith('submit:ip:') ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true };
    },
  };
  const denied = await call({ rateLimiter: limiter });
  assert.equal(denied.result.status, 429);
  assert.equal(denied.result.body.retryAfterSeconds, 60);
  assert.ok(limiter.calls.some(bucket => bucket.startsWith('submit:ip:')));
});


test('untrusted adapter output cannot authorize another host or malformed URL', async () => {
  for (const url of ['https://evil.test/work/4242', 'not a url', 'http://fiction-archive.test/work/4242']) {
    const registry = {recognize: async () => ({source: {provider: FIXTURE_PROVIDER_ARCHIVE, externalId:'4242', url}, metadata:{}, provenance:{provider:FIXTURE_PROVIDER_ARCHIVE,adapterVersion:'v1',policyId:'p'}})};
    const {result} = await call({sources:registry});
    assert.ok([400,503].includes(result.status));
  }
});
test('simultaneous submits through the atomic store return one record', async () => {
  const deps = makeDeps();
  const [a,b] = await Promise.all([handleNovelRequest({token:'good',body:validBody},deps),handleNovelRequest({token:'good',body:validBody},deps)]);
  assert.deepEqual([a.status,b.status].sort(), [200,201]);
  assert.equal(deps.store.created.length, 1);
});
test('unknown field is not reflected in error response', async () => {
  const {result} = await call({}, {body:{...validBody, 'secret-field-value':true}});
  assert.equal(result.status,400);
  assert.ok(!JSON.stringify(result).includes('secret-field-value'));
});

test('concurrent different keys for the same source share one request', async () => {
  const deps = makeDeps();
  const [a,b] = await Promise.all([
    handleNovelRequest({token:'good',body:validBody},deps),
    handleNovelRequest({token:'good',body:{...validBody,idempotencyKey:'idem-key-0002'}},deps),
  ]);
  assert.deepEqual([a.status,b.status].sort(), [200,201]);
  assert.equal(a.body.requestId,b.body.requestId);
  assert.equal(deps.store.created.length,1);
});
test('creation quota is a distinct atomic store outcome', async () => {
  const store = {submitAtomically: async () => ({kind:'quota-exceeded',retryAfterSeconds:45})};
  const {result} = await call({store});
  assert.equal(result.status,429);
  assert.equal(result.body.retryAfterSeconds,45);
});
