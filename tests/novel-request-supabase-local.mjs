// Real Supabase Auth/PostgREST in a disposable local stack; no hosted project.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseIdentityVerifier } from '../src/lib/novel-requests/supabase-identity.ts';
import { createPostgresRequestStore } from '../src/lib/novel-requests/postgres-store.ts';
import { createRequesterReferenceDeriver } from '../src/lib/novel-requests/handler.ts';
import { handleRequestHttp } from '../src/lib/novel-requests/http.ts';
import { identifySource } from '../src/lib/novel-requests/core.ts';
import { fixtureAdapter, FIXTURE_PROVIDER_ARCHIVE } from '../src/lib/novel-requests/prototype-fixtures.ts';

if (process.env.HUNMENG_LOCAL_SUPABASE !== 'yes' || !process.env.LOCAL_SUPABASE_ENV || !process.env.PG_MODULE_DIR)
  throw new Error('Disposable Supabase opt-in and local test paths required');
const envText = await readFile(process.env.LOCAL_SUPABASE_ENV, 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const match = /^([A-Z_]+)="?([^"\r\n]+)"?$/.exec(line);
  if (match) env[match[1]] = match[2];
}
const apiUrl = env.API_URL;
const dbUrl = env.DB_URL;
const anonKey = env.ANON_KEY;
const serviceKey = env.SERVICE_ROLE_KEY;
const jwtSecret = env.JWT_SECRET;
if (!apiUrl || !dbUrl || !anonKey || !serviceKey || !jwtSecret) throw new Error('Local stack environment is incomplete');
const api = new URL(apiUrl), database = new URL(dbUrl);
if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(api.hostname) ||
    api.port !== '54321' || !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    database.port !== '54322' || database.pathname !== '/postgres')
  throw new Error('Only the disposable localhost Supabase stack is allowed');

const require = createRequire(resolve(process.env.PG_MODULE_DIR, 'package.json'));
const { Pool, Client } = require('pg');
const db = new Pool({ connectionString: dbUrl, max: 2, connectionTimeoutMillis: 5000 });
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceKey, options);
const one = createClient(apiUrl, anonKey, options);
const two = createClient(apiUrl, anonKey, options);
const pass = 'LocalSynthetic-Only-123456!';
let restricted;

async function createTestUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (error || !data?.user?.id) throw new Error('Local synthetic account creation failed');
  return data.user.id;
}
async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
  if (error || !data?.session?.access_token) throw new Error('Local synthetic sign-in failed');
  return data.session.access_token;
}
async function visibleRequests(client) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await client.from('request_owner_view').select('id');
    if (!error) return data;
    if (attempt === 9) throw new Error(`Local owner-view query failed: ${error.code ?? 'unknown'}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

try {
  await db.query(`
    create table public.novel_staff (user_id uuid primary key, role text not null);
    create table public.novel_sources (id uuid primary key, rights_status text, rights_valid_until date,
      permission_translate boolean, permission_publish boolean, verified_by uuid,
      verified_at timestamptz, rights_evidence text);
  `);
  for (const name of ['novel-requests-schema-draft.sql', 'novel-requests-store-draft.sql', 'novel-requests-executor-draft.sql'])
    await db.query(await readFile(`docs/proposals/${name}`, 'utf8'));
  await db.query("create role hunmeng_request_test_login login password 'LocalOnly-NotARealSecret-123'; grant hunmeng_request_executor to hunmeng_request_test_login");
  await db.query("notify pgrst, 'reload schema'");

  const userOne = await createTestUser('fixture-one@example.com');
  await createTestUser('fixture-two@example.com');
  const tokenOne = await signIn(one, 'fixture-one@example.com');
  await signIn(two, 'fixture-two@example.com');
  const identity = createSupabaseIdentityVerifier(one.auth);
  assert.equal((await identity.verify(tokenOne)).userId, userOne);
  assert.equal(await identity.verify('invalid-fixture-token'), null);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userOne, role: 'authenticated', aud: 'authenticated', iat: 1, exp: 2 });
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  assert.equal(await identity.verify(`${header}.${payload}.${signature}`), null);

  restricted = new Client({ host: '127.0.0.1', port: 54322, database: 'postgres',
    user: 'hunmeng_request_test_login', password: 'LocalOnly-NotARealSecret-123', connectionTimeoutMillis: 5000 });
  await restricted.connect();
  await assert.rejects(restricted.query('select * from public.novel_requests'), /permission denied/);
  await assert.rejects(restricted.query('select * from auth.users'), /permission denied/);
  await assert.rejects(restricted.query('select * from private.request_rights_evidence'), /permission denied/);

  const config = {
    allowedOrigins: ['https://hunmeng-novel.test'],
    dependencies: {
      identity,
      requesterReferences: createRequesterReferenceDeriver(new Uint8Array(32).fill(7)),
      allowedAdapters: [fixtureAdapter],
      sources: { recognize: async url => ({ source: identifySource(url, [fixtureAdapter]), metadata: {},
        provenance: { provider: FIXTURE_PROVIDER_ARCHIVE, adapterVersion: '1', policyId: 'fixture' } }) },
      catalog: { works: async () => [] }, rateLimiter: { check: async () => ({ allowed: true }) },
      store: createPostgresRequestStore(restricted),
    },
  };
  const makeRequest = token => new Request('https://hunmeng-novel.test/api/novel-requests', {
    method: 'POST', headers: { origin: 'https://hunmeng-novel.test', authorization: `Bearer ${token}`,
      'content-type': 'application/json', 'idempotency-key': 'local-auth-test-key' },
    body: JSON.stringify({ url: 'https://fiction-archive.test/work/8118' }),
  });
  const response = await handleRequestHttp(makeRequest(tokenOne), config);
  assert.equal(response.status, 201);
  const requestId = (await response.json()).requestId;
  const replay = await handleRequestHttp(makeRequest(tokenOne), config);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).deduplicated, 'replay');
  const own = await visibleRequests(one);
  const other = await visibleRequests(two);
  assert.deepEqual(own.map(row => row.id), [requestId]);
  assert.deepEqual(other, []);
  const { error: directError } = await one.from('novel_requests').select('id');
  assert.ok(directError, 'authenticated users cannot select base request table');
  const banned = await admin.auth.admin.updateUserById(userOne, { ban_duration: '1h' });
  if (banned.error) throw new Error('Local synthetic account ban failed');
  const bannedIdentity = await identity.verify(tokenOne);
  assert.ok(!bannedIdentity || !bannedIdentity.active, 'banned user cannot submit');
  const removed = await admin.auth.admin.deleteUser(userOne);
  if (removed.error) throw new Error('Local synthetic account deletion failed');
  const deletedIdentity = await identity.verify(tokenOne);
  assert.ok(!deletedIdentity || !deletedIdentity.active, 'deleted user cannot submit');
  console.log('PASS local Supabase Auth (valid/expired/banned/deleted), two-user isolation and limited database login');
} finally {
  if (restricted) await restricted.end().catch(() => {});
  await db.end();
}
