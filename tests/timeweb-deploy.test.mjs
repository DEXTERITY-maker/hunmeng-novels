import test from 'node:test';
import assert from 'node:assert/strict';
import { deployTimeweb, selectApp, publicOrigin, productionHost } from '../scripts/deploy-timeweb.mjs';
const sha = 'a'.repeat(40);
const token = 'synthetic-timeweb-token-for-tests';
const app = { id: 42, branch_name: 'main', repository: { url: 'https://github.com/DEXTERITY-maker/hunmeng-novels.git' },
  domains: [{ fqdn: productionHost }], commit_sha: 'b'.repeat(40), envs: { PRIVATE_VALUE: 'synthetic-private-value' } };
const deployment = { id: 'deploy-1', app_id: '42', commit_sha: sha, status: 'created' };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fixture(overrides = {}) {
  const calls = [], logs = [];
  let posted = false;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.startsWith('https://' + productionHost)) {
      assert.equal(options.headers?.Authorization, undefined, 'Timeweb credentials must never reach the website');
      if (url.endsWith('.webp')) return new Response(Buffer.from('RIFF0000WEBPtest'));
      return new Response('<html lang="en"><title>Hunmeng novels</title><main id="main" class="home-hero">Browse genres</main></html>');
    }
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    if (url.endsWith('/apps')) return json({ apps: overrides.apps ?? [app] });
    if (url.includes('/deploys?')) return json({ deploys: overrides.existing ?? (posted ? [{ ...deployment, status: overrides.status ?? 'success' }] : []) });
    if (url.endsWith('/deploy')) {
      posted = true;
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { commit_sha: sha });
      if (overrides.postError) throw new Error(token);
      return json({ deploy: { ...deployment, ...overrides.created } });
    }
    if (url.endsWith('/apps/42')) return json({ app: { ...app, commit_sha: sha } });
    throw new Error('Unexpected fixture URL');
  };
  return { calls, logs, args: { token, sha, fetchImpl, sleep: async () => {}, log: value => logs.push(value) } };
}
test('deploys the exact commit to the matching app once and verifies public pages without credentials', async () => {
  const f = fixture(); const result = await deployTimeweb(f.args);
  assert.equal(result.commit, sha); assert.equal(result.appId, '42');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.filter(call => call.url.startsWith('https://' + productionHost)).length, 8);
  assert.ok(!f.logs.join('\n').includes(token)); assert.ok(!f.logs.join('\n').includes(app.envs.PRIVATE_VALUE));
});
test('rejects no match, wrong branch and ambiguous app identity before any mutation', async () => {
  for (const apps of [[], [{ ...app, branch_name: 'other' }], [app, { ...app, id: 43 }]]) {
    const f = fixture({ apps }); await assert.rejects(deployTimeweb(f.args), /Expected one Hunmeng app/);
    assert.equal(f.calls.some(call => call.method === 'POST'), false);
  }
  assert.throws(() => selectApp([{ ...app, domains: [{ fqdn: 'other.example' }] }]), /technical domain/);
});
test('requires the expected GitHub repository even when a domain matches', () => {
  assert.throws(() => selectApp([{ ...app, repository: { url: 'https://github.com/unrelated/repo' } }]), /found 0/);
});
test('reuses the successful current deployment without a duplicate POST', async () => {
  const existing = { ...deployment, status: 'success' };
  const f = fixture({ apps: [{ ...app, commit_sha: sha }], existing: [existing] });
  await deployTimeweb(f.args); assert.equal(f.calls.some(call => call.method === 'POST'), false);
});
test('a lost POST response is not retried and upstream errors never include the token', async () => {
  const f = fixture({ postError: true });
  await assert.rejects(deployTimeweb(f.args), error => !error.message.includes(token) && error.message.includes('no second POST'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('a failed deployment stops without starting another deployment', async () => {
  const f = fixture({ status: 'failure' });
  await assert.rejects(deployTimeweb(f.args), /finished with status failure/);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.some(call => call.url.startsWith('https://' + productionHost)), false);
});
test('a mismatched deployment response is rejected', async () => {
  const f = fixture({ created: { commit_sha: 'c'.repeat(40) } });
  await assert.rejects(deployTimeweb(f.args), /did not match/);
});
test('missing credentials and invalid commits fail before making network requests', async () => {
  const f = fixture();
  await assert.rejects(deployTimeweb({ ...f.args, token: '' }), /TIMEWEB_API_TOKEN/);
  await assert.rejects(deployTimeweb({ ...f.args, sha: 'main' }), /full validated commit SHA/);
  assert.equal(f.calls.length, 0);
});
test('API errors with sensitive bodies report only the HTTP status', async () => {
  const f = fixture(); f.args.fetchImpl = async () => new Response(JSON.stringify({ detail: token }), { status: 401 });
  await assert.rejects(deployTimeweb(f.args), error => error.message.includes('HTTP 401') && !error.message.includes(token));
});

test('supports the live branch field and a replacement technical domain on the same repository', () => {
  const live = { ...app, branch_name: undefined, branch: 'main', domains: [{ fqdn: 'hunmeng-replacement.twc1.net', is_technical: true }] };
  assert.equal(selectApp([live]).id, 42);
  assert.equal(publicOrigin(live), 'https://hunmeng-replacement.twc1.net');
  assert.throws(() => selectApp([{ ...live, domains: [{ fqdn: 'private.example', is_technical: true }] }]), /technical domain/);
});
