import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTimeweb } from '../scripts/timeweb-status.mjs';

const sha = 'a'.repeat(40);
const host = 'https://dexterity-maker-hunmeng-novels-364c.twc1.net';
const app = { id: 1234, branch_name: 'main', commit_sha: sha,
  repository: { full_name: 'DEXTERITY-maker/hunmeng-novels' },
  domains: [{ fqdn: 'dexterity-maker-hunmeng-novels-364c.twc1.net' }] };

function mockFetch(url, options) {
  assert.equal(options.method, 'GET');
  if (url === 'https://api.timeweb.cloud/api/v1/apps') {
    assert.equal(options.headers.Authorization, 'Bearer secret-example');
    return { ok: true, json: async () => ({ apps: [app] }) };
  }
  if (url === 'https://api.timeweb.cloud/api/v1/apps/1234/deploys?limit=5') {
    assert.equal(options.headers.Authorization, 'Bearer secret-example');
    return { ok: true, json: async () => ({ deploys: [{ id: 'abc123', commit_sha: sha, status: 'success' }] }) };
  }
  assert.ok(url.startsWith(host + '/'));
  assert.equal(options.headers, undefined, 'No Timeweb token must be sent to the public site');
  return { ok: true, text: async () => '<html lang="en"><main id="main">Hunmeng</main></html>' };
}

test('checks selected app, deployments and public pages without writing or leaking credentials', async () => {
  const messages = [];
  const result = await inspectTimeweb({ token: 'secret-example', expectedSha: sha, fetchImpl: mockFetch,
    log: message => messages.push(message) });
  assert.deepEqual(result, { appId: '1234', publishedSha: sha, current: true });
  assert.equal(messages.some(line => line.includes('secret-example')), false);
  assert.equal(messages.filter(line => line.includes('Public page')).length, 5);
});

test('rejects an invalid token before any network request', async () => {
  await assert.rejects(inspectTimeweb({ token: '', expectedSha: sha,
    fetchImpl: () => { throw new Error('unexpected fetch'); } }), /TIMEWEB_API_TOKEN/);
});

test('fails when a public route is unavailable', async () => {
  await assert.rejects(inspectTimeweb({ token: 'secret-example', expectedSha: sha, log: () => {},
    fetchImpl: async (url, options) => url === host + '/news/'
      ? { ok: false, text: async () => 'unavailable' }
      : mockFetch(url, options) }), /health check failed/);
});
