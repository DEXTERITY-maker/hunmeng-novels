import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSecretKinds } from '../scripts/public-secrets.mjs';
test('аудит отличает публичные ключи от приватных, не возвращая значения', () => {
  assert.deepEqual(publicSecretKinds('sb_publishable_fake_fixture'), []);
  assert.deepEqual(publicSecretKinds('sb_secret_fake_fixture'), ['секретный Supabase key']);
  const fakeJwt = 'eyJhbGciOiJub25lIn0.' + Buffer.from('{"role":"service_role"}').toString('base64url') + '.fixture';
  assert.deepEqual(publicSecretKinds(fakeJwt), ['service-role JWT']);
});
