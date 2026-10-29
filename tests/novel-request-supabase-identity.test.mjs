import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseIdentityVerifier } from '../src/lib/novel-requests/supabase-identity.ts';

const id = '40000000-0000-4000-8000-000000000001';
const response = user => ({ data: { user }, error: null });

test('verified user comes from getUser(token); editable metadata never grants a role', async () => {
  let seen = null;
  const verifier = createSupabaseIdentityVerifier({ getUser: async token => {
    seen = token;
    return response({ id, user_metadata: { role: 'admin' } });
  } });
  assert.deepEqual(await verifier.verify('fixture-token'), { userId: id, role: 'user', active: true });
  assert.equal(seen, 'fixture-token');
  assert.equal(await verifier.verify(null), null);
});

test('invalid sessions return null; unavailable or malformed auth fails closed', async () => {
  const invalid = createSupabaseIdentityVerifier({ getUser: async () => ({ data: { user: null }, error: { status: 401 } }) });
  assert.equal(await invalid.verify('invalid'), null);
  const down = createSupabaseIdentityVerifier({ getUser: async () => ({ data: { user: null }, error: { status: 503 } }) });
  await assert.rejects(down.verify('token'));
  const broken = createSupabaseIdentityVerifier({ getUser: async () => response({ id: 'bad' }) });
  await assert.rejects(broken.verify('token'));
});

test('anonymous, deleted and currently banned accounts are inactive', async () => {
  for (const user of [
    { id, is_anonymous: true },
    { id, deleted_at: '2026-01-01T00:00:00Z' },
    { id, banned_until: '2999-01-01T00:00:00Z' },
  ]) {
    const verifier = createSupabaseIdentityVerifier({ getUser: async () => response(user) });
    assert.equal((await verifier.verify('token')).active, false);
  }
  const malformed = createSupabaseIdentityVerifier({ getUser: async () => response({ id, banned_until: 'invalid' }) });
  await assert.rejects(malformed.verify('token'));
});
