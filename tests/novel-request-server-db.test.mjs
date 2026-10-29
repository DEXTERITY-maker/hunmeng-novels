import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestDatabaseExecutor } from '../src/lib/novel-requests/server-db.ts';

const ref = 'abcdefghijklmnopqrst';
const url = `postgresql://hunmeng_request_login.${ref}:fixture-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
const createQuery = 'select private.request_store_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as result';
const readQuery = 'select * from private.request_store_read($1,$2,$3)';

test('accepts only the intended pooler login with strict TLS and bounded pool', async () => {
  let options, closed = false;
  const executor = createRequestDatabaseExecutor(url, ref, value => {
    options = value;
    return { query: async (text, values) => ({ rows: [{ text, values }] }), end: async () => { closed = true; } };
  });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.max, 2);
  assert.equal(options.connectionTimeoutMillis, 5000);
  assert.equal(options.statement_timeout, 5000);
  assert.equal(options.query_timeout, 8000);
  assert.equal((await executor.query(readQuery, ['one', 'two', 'three'])).rows.length, 1);
  assert.equal((await executor.query(createQuery, [])).rows.length, 1);
  await assert.rejects(executor.query('select * from auth.users', []));
  await executor.close();
  assert.equal(closed, true);
});

test('rejects unsafe connection options and unexpected identity before creating a pool', () => {
  let calls = 0;
  const factory = () => { calls++; throw new Error('must not be called'); };
  const bad = [url + '?sslmode=disable', url.replace(':6543/', ':5432/'),
    url.replace('hunmeng_request_login.', 'postgres.'),
    url.replace('pooler.supabase.com', 'attacker.example'),
    url.replace('/postgres', '/other'), url.replace('fixture-password', '')];
  for (const value of bad) assert.throws(() => createRequestDatabaseExecutor(value, ref, factory), /Invalid database configuration/);
  assert.throws(() => createRequestDatabaseExecutor(url, 'wrong-project', factory));
  assert.equal(calls, 0);
});

test('database errors do not reveal the connection string or underlying details', async () => {
  const executor = createRequestDatabaseExecutor(url, ref, () => ({
    query: async () => { throw new Error(`credential leak ${url}`); },
    end: async () => {},
  }));
  await assert.rejects(executor.query(readQuery, []), error => {
    assert.equal(error.message, 'Request database unavailable');
    assert.equal(error.message.includes('fixture-password'), false);
    return true;
  });
});
