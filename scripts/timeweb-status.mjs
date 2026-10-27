#!/usr/bin/env node
// Read-only Timeweb check. Never log credentials, API response bodies or app environment.
import { pathToFileURL } from 'node:url';
import { publicOrigin, selectApp } from './deploy-timeweb.mjs';

const api = 'https://api.timeweb.cloud/api/v1';
const routes = ['/', '/catalog/', '/library/', '/news/', '/account/'];
const safeSha = value => /^[a-f\d]{40}$/.test(String(value ?? '')) ? String(value) : 'unavailable';
const safeId = value => /^[a-z\d-]{1,80}$/i.test(String(value ?? '')) ? String(value) : 'unavailable';
const safeStatus = value => /^[a-z_]{1,40}$/.test(String(value ?? '')) ? String(value) : 'unknown';

export async function inspectTimeweb({ token, expectedSha, fetchImpl = fetch, log = console.log } = {}) {
  token = token?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error('TIMEWEB_API_TOKEN is missing or invalid.');
  if (!/^[a-f\d]{40}$/.test(expectedSha ?? '')) throw new Error('Expected the full main-branch Git SHA.');

  async function getJSON(path) {
    let response;
    try {
      response = await fetchImpl(api + path, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Error('Timeweb API connection failed.'); }
    if (!response.ok) throw new Error('Timeweb returned HTTP ' + response.status + '.');
    try { return await response.json(); }
    catch { throw new Error('Timeweb returned invalid JSON.'); }
  }

  const app = selectApp((await getJSON('/apps')).apps);
  const deployments = (await getJSON('/apps/' + app.id + '/deploys?limit=5')).deploys;
  if (!Array.isArray(deployments)) throw new Error('Timeweb returned an invalid deployment list.');
  const origin = publicOrigin(app);
  log('Hunmeng site: ' + origin + '/');
  log('Timeweb app: ' + safeId(app.id));
  log('GitHub main: ' + expectedSha);
  log('Published commit: ' + safeSha(app.commit_sha));
  log('Published main HEAD: ' + (app.commit_sha === expectedSha ? 'yes' : 'no (may be deploying or out of date)'));
  log('Recent deployments (metadata only):');
  for (const deployment of deployments.slice(0, 5)) {
    log('  id=' + safeId(deployment.id) + ' status=' + safeStatus(deployment.status) + ' commit=' + safeSha(deployment.commit_sha));
  }
  let failed = false;
  for (const route of routes) {
    let healthy = false;
    try {
      const response = await fetchImpl(origin + route, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const html = await response.text();
        healthy = /<html\b[^>]*lang="en"/.test(html) && html.includes('Hunmeng') && html.includes('id="main"');
      }
    } catch { /* Never print response body or errors containing external data. */ }
    log('Public page ' + route + ': ' + (healthy ? 'OK' : 'FAILED'));
    failed ||= !healthy;
  }
  if (failed) throw new Error('A public page health check failed.');
  return { appId: String(app.id), publishedSha: safeSha(app.commit_sha), current: app.commit_sha === expectedSha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectTimeweb({ token: process.env.TIMEWEB_API_TOKEN, expectedSha: process.env.GITHUB_SHA })
    .catch(() => { console.error('Timeweb inspection failed. See safe status lines above.'); process.exitCode = 1; });
}
