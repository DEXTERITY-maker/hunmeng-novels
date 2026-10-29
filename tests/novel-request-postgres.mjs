// Runs only against an explicitly opted-in disposable PostgreSQL database.
// No Supabase credentials, production data, network adapters or publication.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

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
  } finally { setup.release(); }

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
    await b.query('set constraints all immediate');
    await a.query('commit');
    await b.query('commit');
    const result = await pool.query(`select count(*)::int as n from public.request_consistency_report()
      where issue = 'external_source_work_mismatch'`);
    assert.equal(result.rows[0].n, 0, 'CONCURRENCY BLOCKER: concurrent transactions committed inconsistent source/work links');
    console.log('PASS concurrency: no source/work mismatch');
  } finally {
    await a.query('rollback').catch(() => {});
    await b.query('rollback').catch(() => {});
    a.release(); b.release();
  }
}

try { await run(); } finally { await pool.end(); }
