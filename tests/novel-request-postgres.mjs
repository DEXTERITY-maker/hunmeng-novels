// Runs only against an explicitly opted-in disposable PostgreSQL database.
// No Supabase credentials, production data, network adapters or publication.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createSupabaseIdentityVerifier } from '../src/lib/novel-requests/supabase-identity.ts';
import { createPostgresRequestStore } from '../src/lib/novel-requests/postgres-store.ts';
import { createRequesterReferenceDeriver } from '../src/lib/novel-requests/handler.ts';
import { handleRequestHttp } from '../src/lib/novel-requests/http.ts';
import { identifySource } from '../src/lib/novel-requests/core.ts';
import { fixtureAdapter, FIXTURE_PROVIDER_ARCHIVE } from '../src/lib/novel-requests/prototype-fixtures.ts';

if (process.env.HUNMENG_DISPOSABLE_PG !== 'yes' || !process.env.PG_MODULE_DIR)
  throw new Error('Disposable PostgreSQL opt-in and PG_MODULE_DIR are required');
if (!['127.0.0.1', 'localhost'].includes(process.env.PGHOST ?? ''))
  throw new Error('Only localhost test databases are allowed');
if (process.env.PGDATABASE !== 'hunmeng_requests_test')
  throw new Error('Unexpected test database name');
const require = createRequire(resolve(process.env.PG_MODULE_DIR, 'package.json'));
const { Pool } = require('pg');
const pool = new Pool({ max: 4, connectionTimeoutMillis: 5000 });
const source = '10000000-0000-4000-8000-000000000001';
const raceSource = '10000000-0000-4000-8000-000000000002';
const workA = '20000000-0000-4000-8000-000000000001';
const workB = '20000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000001';
const userA = '40000000-0000-4000-8000-000000000001';
const userB = '40000000-0000-4000-8000-000000000002';

async function run() {
  const setup = await pool.connect();
  try {
    // These are minimal test doubles; they are not the live Supabase schema.
    await setup.query(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table public.novel_staff (user_id uuid primary key, role text not null);
      create table public.novel_sources (
        id uuid primary key, rights_status text, rights_valid_until date,
        permission_translate boolean, permission_publish boolean,
        verified_by uuid, verified_at timestamptz, rights_evidence text
      );
    `);
    await setup.query(await readFile('docs/proposals/novel-requests-schema-draft.sql', 'utf8'));
    await setup.query(await readFile('docs/proposals/novel-requests-store-draft.sql', 'utf8'));
    await setup.query(await readFile('docs/proposals/novel-requests-executor-draft.sql', 'utf8'));
    await setup.query(`
      insert into auth.users values ('${userA}'), ('${userB}');
      insert into public.request_works (id, canonical_title, normalized_title) values
        ('${workA}', 'Fixture A', 'fixture a'), ('${workB}', 'Fixture B', 'fixture b');
      insert into public.request_external_sources (id, provider, external_id, canonical_url, host, work_id) values
        ('${source}', 'fixture', 'one', 'https://fiction.test/work/1', 'fiction.test', '${workA}'),
        ('${raceSource}', 'fixture', 'race', 'https://fiction.test/work/2', 'fiction.test', '${workA}');
      insert into public.novel_requests (id, requester_id, requester_ref, submitted_url, external_source_id, work_id, idempotency_key, request_fingerprint)
      values ('${requestId}', '${userA}', repeat('a',64), 'https://fiction.test/work/1', '${source}', '${workA}', 'fixture-key', repeat('b',64));
    `);
    console.log('PASS schema and fixture insertion');

    await setup.query('begin');
    await setup.query(`update public.request_external_sources set work_id = '${workB}' where id = '${source}'`);
    await assert.rejects(setup.query('commit'), /External source is not linked/);
    await setup.query('rollback');
    assert.equal((await setup.query(`select work_id from public.request_external_sources where id = '${source}'`)).rows[0].work_id, workA);
    console.log('PASS inconsistent source update rejected at commit');

    await setup.query('set role authenticated');
    await setup.query(`select set_config('request.jwt.claim.sub', '${userA}', false)`);
    assert.equal((await setup.query('select count(*)::int as n from public.request_owner_view')).rows[0].n, 1);
    await setup.query(`select set_config('request.jwt.claim.sub', '${userB}', false)`);
    assert.equal((await setup.query('select count(*)::int as n from public.request_owner_view')).rows[0].n, 0);
    await assert.rejects(setup.query('select * from public.novel_requests'), /permission denied/);
    await setup.query('reset role');
    await setup.query('set role service_role');
    await assert.rejects(setup.query('select * from private.request_rights_evidence'), /permission denied/);
    await setup.query('reset role');
    console.log('PASS synthetic requester isolation and private evidence denial');

    const acl = await setup.query(`select
      has_function_privilege('authenticated', 'private.request_store_create(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,jsonb,text)', 'execute') as authenticated,
      has_function_privilege('anon', 'private.request_store_create(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,jsonb,text)', 'execute') as anonymous,
      has_function_privilege('service_role', 'private.request_store_create(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,jsonb,text)', 'execute') as service`);
    assert.deepEqual(acl.rows[0], { authenticated: false, anonymous: false, service: false });
    console.log('PASS isolated store is not executable by public roles');
  } finally { setup.release(); }

  const submit = async ({ actor = userA, ref = '9'.repeat(64), external = '4242', key = 'store-key-1', fingerprint = '8'.repeat(64), note = '' } = {}) => {
    const params = [actor, ref, 'fixture', external, `https://fiction.test/work/${external}`, 'fiction.test', key, fingerprint, note, '{}', '{}', '1', 'fixture', '[]', 'requests-match-v1'];
    return (await pool.query('select private.request_store_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15) as result', params)).rows[0].result;
  };
  const simultaneous = await Promise.all([submit(), submit()]);
  assert.deepEqual(simultaneous.map(x => x.kind).sort(), ['new', 'replay']);
  assert.equal(simultaneous[0].request_id, simultaneous[1].request_id);
  assert.equal((await submit({ fingerprint: '7'.repeat(64) })).kind, 'conflict');
  const active = await submit({ key: 'store-key-2' });
  assert.equal(active.kind, 'active-request');
  assert.equal(active.request_id, simultaneous[0].request_id);
  assert.equal((await submit({ key: 'store-key-2' })).kind, 'replay');
  assert.equal((await submit({ key: 'store-key-2', fingerprint: '6'.repeat(64) })).kind, 'conflict');
  const other = await submit({ actor: userB, ref: '5'.repeat(64), key: 'store-key-3' });
  assert.equal(other.kind, 'new');
  assert.notEqual(other.request_id, active.request_id);
  const shared = await pool.query(`select count(*)::int as n from public.novel_requests r
    join public.request_external_sources e on e.id=r.external_source_id where e.provider='fixture' and e.external_id='4242'`);
  assert.equal(shared.rows[0].n, 2);
  await assert.rejects(submit({ actor: userB, ref: '9'.repeat(64) }), /Request identity mismatch/);
  console.log('PASS concurrent replay, conflict, active request, and cross-user isolation');

  // Real HTTP/handler/store/PostgreSQL path; Auth is a synthetic getUser double.
  // No production Supabase, actual JWT, source fetch, or secrets are used.
  const auth = createSupabaseIdentityVerifier({ getUser: async token => token === 'test-token'
    ? { data: { user: { id: userA } }, error: null }
    : { data: { user: null }, error: { status: 401 } } });
  // A dedicated NOLOGIN, NOINHERIT, non-BYPASSRLS role can only execute the
  // two request functions. This fixture uses SET ROLE, not login credentials.
  const restricted = await pool.connect();
  await restricted.query('set role hunmeng_request_executor');
  await assert.rejects(restricted.query('select * from public.novel_requests'), /permission denied/);
  await assert.rejects(restricted.query('select * from public.request_client_hints'), /permission denied/);
  await assert.rejects(restricted.query('select * from private.request_rights_evidence'), /permission denied/);
  await assert.rejects(restricted.query('select * from auth.users'), /permission denied/);
  await assert.rejects(restricted.query('delete from public.novel_requests'), /permission denied/);
  const adapter = createPostgresRequestStore(restricted);
  const config = {
    allowedOrigins: ['https://hunmeng-novel.test'],
    dependencies: {
      identity: auth,
      requesterReferences: createRequesterReferenceDeriver(new Uint8Array(32).fill(7)),
      allowedAdapters: [fixtureAdapter],
      sources: { recognize: async url => ({ source: identifySource(url, [fixtureAdapter]), metadata: {},
        provenance: { provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: '1', policyId: 'fixture' } }) },
      catalog: { works: async () => [] },
      rateLimiter: { check: async () => ({ allowed: true }) },
      store: adapter,
    },
  };
  const request = (key, token = 'test-token', url = 'https://fiction-archive.test/work/8118') => new Request('https://hunmeng-novel.test/api/novel-requests', {
    method: 'POST', headers: { origin: 'https://hunmeng-novel.test', authorization: `Bearer ${token}`,
      'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ url, note: 'synthetic note' }),
  });
  const firstHttp = await handleRequestHttp(request('http-fixture-key'), config);
  assert.equal(firstHttp.status, 201);
  const firstBody = await firstHttp.json();
  const saved = await pool.query('select requester_id, client_note from public.novel_requests where id = $1', [firstBody.requestId]);
  assert.equal(saved.rows[0].requester_id, userA);
  assert.equal(saved.rows[0].client_note, 'synthetic note');
  assert.equal(JSON.stringify(firstBody).includes(userA), false);
  const ref = await config.dependencies.requesterReferences.derive(userA);
  const foreign = await restricted.query('select * from private.request_store_read($1,$2,$3)', [firstBody.requestId, userB, ref]);
  assert.equal(foreign.rows.length, 0);
  const wrongRef = await restricted.query('select * from private.request_store_read($1,$2,$3)', [firstBody.requestId, userA, '0'.repeat(64)]);
  assert.equal(wrongRef.rows.length, 0);
  await pool.query("update public.novel_requests set status = 'review', version = version + 1 where id = $1", [firstBody.requestId]);
  const replayHttp = await handleRequestHttp(request('http-fixture-key'), config);
  assert.equal(replayHttp.status, 200);
  const replayBody = await replayHttp.json();
  assert.equal(replayBody.deduplicated, 'replay');
  assert.equal(replayBody.status, 'review');
  assert.equal((await handleRequestHttp(request('invalid-auth-key', 'invalid'), config)).status, 401);
  config.dependencies.sources = { recognize: async url => ({ source: identifySource(url, [fixtureAdapter]),
    metadata: { originalTitle: 'The Pale City', authors: ['A Writer'], description: 'not allowed' },
    provenance: { provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: '1', policyId: 'fixture' } }) };
  assert.equal((await handleRequestHttp(request('blocked-meta-key', 'test-token', 'https://fiction-archive.test/work/8228'), config)).status, 503);
  const noSilentLoss = await pool.query("select count(*)::int as n from public.request_external_sources where external_id = '8228' and provider = $1", [FIXTURE_PROVIDER_ARCHIVE]);
  assert.equal(noSilentLoss.rows[0].n, 0);
  config.dependencies.metadataPolicies = [{ provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: '1', policyId: 'fixture',
    allowedFields: ['originalTitle', 'authors'], evidence: 'fictional fixture permission' }];
  config.dependencies.catalog = { works: async () => [{ id: workA, titles: ['The Pale City'], authors: ['A Writer'], sources: [], chapters: [] }] };
  const matchedResponse = await handleRequestHttp(request('matched-meta-key', 'test-token', 'https://fiction-archive.test/work/8228'), config);
  assert.equal(matchedResponse.status, 201);
  const matchedBody = await matchedResponse.json();
  assert.equal(matchedBody.matches[0].workId, workA);
  assert.equal(matchedBody.matches[0].kind, 'probable');
  const evidence = await pool.query('select metadata, policy_id, algorithm_version from public.request_adapter_metadata where request_id = $1', [matchedBody.requestId]);
  assert.deepEqual(evidence.rows[0].metadata, { originalTitle: 'The Pale City', authors: ['A Writer'] });
  assert.equal(evidence.rows[0].policy_id, 'fixture');
  assert.equal(evidence.rows[0].algorithm_version, 'requests-match-v1');
  config.dependencies.catalog = { works: async () => [] };
  config.dependencies.algorithmVersion = 'requests-match-v2';
  const savedReplay = await (await handleRequestHttp(request('matched-meta-key', 'test-token', 'https://fiction-archive.test/work/8228'), config)).json();
  assert.deepEqual(savedReplay.matches, matchedBody.matches);
  assert.equal(savedReplay.algorithmVersion, 'requests-match-v1');
  config.dependencies.catalog = { works: async () => [{ id: '20000000-0000-4000-8000-999999999999', titles: ['The Pale City'], authors: ['A Writer'], sources: [], chapters: [] }] };
  assert.equal((await handleRequestHttp(request('bad-work-id-key', 'test-token', 'https://fiction-archive.test/work/8338'), config)).status, 503);
  const rolledBackEvidence = await pool.query("select count(*)::int as n from public.request_external_sources where external_id = '8338' and provider = $1", [FIXTURE_PROVIDER_ARCHIVE]);
  assert.equal(rolledBackEvidence.rows[0].n, 0);
  console.log('PASS approved metadata, advisory evidence, original replay and atomic rollback');
  await restricted.query('reset role');
  restricted.release();
  console.log('PASS HTTP, synthetic Auth and PostgreSQL storage via restricted role');

  const activeRaceRef = '3'.repeat(64);
  const activeRace = await Promise.all([
    submit({ ref: activeRaceRef, external: 'parallel-source', key: 'parallel-key-1' }),
    submit({ ref: activeRaceRef, external: 'parallel-source', key: 'parallel-key-2' }),
  ]);
  assert.deepEqual(activeRace.map(x => x.kind).sort(), ['active-request', 'new']);
  assert.equal(activeRace[0].request_id, activeRace[1].request_id);
  assert.equal((await submit({ ref: activeRaceRef, external: 'parallel-source', key: 'parallel-key-2' })).kind, 'replay');
  console.log('PASS concurrent different keys share one active request');

  const quotaRef = '4'.repeat(64);
  for (let i = 0; i < 5; i++)
    assert.equal((await submit({ ref: quotaRef, external: `quota-${i}`, key: `quota-key-${i}` })).kind, 'new');
  assert.equal((await submit({ ref: quotaRef, external: 'quota-0', key: 'quota-key-0' })).kind, 'replay');
  assert.equal((await submit({ ref: quotaRef, external: 'quota-6', key: 'quota-key-6' })).kind, 'quota-exceeded');
  console.log('PASS quota counts new requests only');

  const parallelQuotaRef = '2'.repeat(64);
  const quotas = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    submit({ ref: parallelQuotaRef, external: `parallel-quota-${i}`, key: `parallel-quota-key-${i}` })));
  assert.equal(quotas.filter(x => x.kind === 'new').length, 5);
  assert.equal(quotas.filter(x => x.kind === 'quota-exceeded').length, 3);
  console.log('PASS concurrent submissions cannot exceed creation quota');

  const transaction = await pool.connect();
  const rollbackRef = '1'.repeat(64);
  try {
    await transaction.query('begin');
    const params = [userA, rollbackRef, 'fixture', 'rollback', 'https://fiction.test/work/rollback', 'fiction.test', 'rollback-key', 'a'.repeat(64), '', '{}', '{}', '1', 'fixture', '[]', 'requests-match-v1'];
    const inserted = await transaction.query('select private.request_store_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15) as result', params);
    assert.equal(inserted.rows[0].result.kind, 'new');
    await transaction.query('rollback');
    assert.equal((await submit({ ref: rollbackRef, external: 'rollback', key: 'rollback-key', fingerprint: 'a'.repeat(64) })).kind, 'new');
  } finally { transaction.release(); }
  console.log('PASS rollback removes the request and idempotency binding');

  // Race audit: A reassigns a source while B inserts a request using the old
  // source/work link. Both force deferred checks before either commits. This
  // detects whether the draft permits write skew under READ COMMITTED.
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await a.query("set statement_timeout = '5s'");
    await b.query("set statement_timeout = '5s'");
    await a.query('begin');
    await b.query('begin');
    await a.query(`update public.request_external_sources set work_id = '${workB}' where id = '${raceSource}'`);
    await b.query(`insert into public.novel_requests (requester_id, requester_ref, submitted_url, external_source_id, work_id, idempotency_key, request_fingerprint)
      values ('${userB}', repeat('c',64), 'https://fiction.test/work/2', '${raceSource}', '${workA}', 'race-key', repeat('d',64))`);
    await a.query('set constraints all immediate');
    // B may wait for A's source lock. Begin its check, commit A, then observe
    // whether B is rejected or can safely commit against the new source state.
    const bCheck = b.query('set constraints all immediate').then(
      () => ({ ok: true }), error => ({ ok: false, error }),
    );
    // Allow B to reach the check while A remains uncommitted. If a lock exists,
    // B must wait; without one, it may incorrectly accept a stale snapshot.
    await Promise.race([bCheck, new Promise(resolve => setTimeout(resolve, 500))]);
    await a.query('commit');
    const outcome = await bCheck;
    if (outcome.ok) await b.query('commit');
    else {
      assert.match(outcome.error.message, /External source is not linked/);
      await b.query('rollback');
    }
    const result = await pool.query(`select count(*)::int as n from public.request_consistency_report()
      where issue = 'external_source_work_mismatch'`);
    assert.equal(result.rows[0].n, 0, 'CONCURRENCY BLOCKER: concurrent transactions committed inconsistent source/work links');
    console.log('PASS concurrency: no source/work mismatch');

    // A second write-skew case: work's editorial link changes concurrently
    // with a new draft that was validated against the old link.
    const source3 = '10000000-0000-4000-8000-000000000003';
    const request3 = '30000000-0000-4000-8000-000000000003';
    const editorial1 = '50000000-0000-4000-8000-000000000001';
    const editorial2 = '50000000-0000-4000-8000-000000000002';
    await pool.query(`
      insert into public.novel_sources(id) values ('${editorial1}'), ('${editorial2}');
      update public.request_works set novel_source_id = '${editorial1}', state = 'converted' where id = '${workA}';
      insert into public.request_external_sources (id, provider, external_id, canonical_url, host, work_id)
        values ('${source3}', 'fixture', 'three', 'https://fiction.test/work/3', 'fiction.test', '${workA}');
      insert into public.novel_requests (id, requester_id, requester_ref, submitted_url, external_source_id, work_id, idempotency_key, request_fingerprint)
        values ('${request3}', '${userB}', repeat('e',64), 'https://fiction.test/work/3', '${source3}', '${workA}', 'work-race-key', repeat('f',64));
    `);
    await a.query('begin');
    await b.query('begin');
    await a.query(`update public.request_works set novel_source_id = '${editorial2}' where id = '${workA}'`);
    await b.query(`insert into public.request_drafts (request_id, work_id, source_url, converted_source_id)
      values ('${request3}', '${workA}', 'https://fiction.test/work/3', '${editorial1}')`);
    await a.query('set constraints all immediate');
    const draftCheck = b.query('set constraints all immediate').then(
      () => ({ ok: true }), error => ({ ok: false, error }),
    );
    await Promise.race([draftCheck, new Promise(resolve => setTimeout(resolve, 500))]);
    await a.query('commit');
    const draftOutcome = await draftCheck;
    if (draftOutcome.ok) await b.query('commit');
    else {
      assert.match(draftOutcome.error.message, /Draft source differs from the work source/);
      await b.query('rollback');
    }
    const workDrift = await pool.query(`select count(*)::int as n from public.request_consistency_report()
      where issue = 'draft_source_differs_from_work' and request_id = '${request3}'`);
    assert.equal(workDrift.rows[0].n, 0, 'CONCURRENCY BLOCKER: work/draft links became inconsistent');
    console.log('PASS concurrency: no work/draft mismatch');
  } finally {
    await a.query('rollback').catch(() => {});
    await b.query('rollback').catch(() => {});
    a.release(); b.release();
  }
}

try { await run(); } finally { await pool.end(); }
