#!/usr/bin/env node
// Timeweb App Platform API, based on timeweb-cloud/sdk-go AppsAPI.
// The token is supplied by GitHub Actions only; never print API bodies or app.envs.
import { pathToFileURL } from 'node:url';

const API = 'https://api.timeweb.cloud/api/v1';
export const productionHost = 'dexterity-maker-hunmeng-novels-f1c8.twc1.net';
const repositoryName = 'dexterity-maker/hunmeng-novels';
const pending = new Set(['created', 'started', 'building', 'deploying', 'preparing_environment', 'cloning_code',
  'installing_dependencies', 'building_code', 'checking_ssl_certs', 'cleaning_up',
  'running_container', 'stopping']);
const terminal = new Set(['failure', 'access_error', 'stopped']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function repoMatches(repository) {
  if (String(repository?.full_name).toLowerCase() === repositoryName) return true;
  try {
    const url = new URL(repository?.url);
    return url.hostname === 'github.com' && url.pathname.replace(/^\//, '').replace(/\/?$/, '').replace(/\.git$/, '').toLowerCase() === repositoryName;
  } catch { return false; }
}
export function selectApp(apps) {
  if (!Array.isArray(apps)) throw new Error('Timeweb returned an invalid app list.');
  const candidates = apps.filter(app => (app.branch_name ?? app.branch) === 'main' && repoMatches(app.repository));
  const oldHostMatches = candidates.filter(app => app.domains?.some(domain => domain.fqdn === productionHost));
  const matches = oldHostMatches.length ? oldHostMatches : candidates;
  if (matches.length !== 1) throw new Error(`Expected one Hunmeng app on main; found ${matches.length}. No deployment was started.`);
  if (!/^\d+$/.test(String(matches[0].id))) throw new Error('Timeweb returned an invalid app ID.');
  publicOrigin(matches[0]);
  return matches[0];
}
export function publicOrigin(app) {
  const hosts = app.domains?.filter(domain => domain.fqdn === productionHost ||
    (domain.is_technical === true && /^[a-z0-9-]+\.twc1\.net$/i.test(domain.fqdn)))
    .map(domain => domain.fqdn.toLowerCase());
  const unique = [...new Set(hosts ?? [])];
  if (unique.length !== 1) throw new Error('Could not identify one existing Timeweb technical domain for Hunmeng.');
  return 'https://' + unique[0];
}

export async function deployTimeweb({ token, sha, fetchImpl = fetch, sleep = pause,
  log = console.log, timeoutMs = 20 * 60 * 1000 } = {}) {
  token = token?.trim();
  if (!token || /[\r\n]/.test(token)) throw new Error('TIMEWEB_API_TOKEN is missing or invalid. Add it to repository Actions secrets.');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('A full validated commit SHA is required.');
  async function request(path, body) {
    let response;
    try {
      response = await fetchImpl(API + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      // Do not retry a POST: a timeout may occur after the deployment has started.
      throw new Error(body === undefined ? 'Timeweb API connection failed.' :
        'The deployment request could not be confirmed. Check Timeweb deployments before retrying; no second POST was sent.');
    }
    if (!response.ok) throw new Error(`Timeweb API returned HTTP ${response.status}. Response details are withheld to protect credentials.`);
    try { return await response.json(); }
    catch { throw new Error('Timeweb API returned invalid JSON.'); }
  }
  const app = selectApp((await request('/apps')).apps);
  const path = `/apps/${app.id}`;
  const origin = publicOrigin(app);
  log(`Hunmeng app ${app.id}; deploying commit ${sha}; site ${origin}/.`);
  const deployments = (await request(path + '/deploys?limit=100')).deploys;
  if (!Array.isArray(deployments)) throw new Error('Timeweb returned an invalid deployment list.');
  // The app endpoint identifies the application by a numeric ID, while individual
  // deployment records contain an internal UUID in app_id. Compare UUIDs only
  // with other deployments returned by this scoped endpoint, never with app.id.
  const internalAppId = deployments.find(d => typeof d.app_id === 'string')?.app_id;
  const current = deployments.filter(d => d.commit_sha === sha)
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
  let deployment;
  if (current && (pending.has(current.status) || (current.status === 'success' && app.commit_sha === sha))) {
    deployment = current;
    log('Reusing the existing deployment for this commit.');
  } else {
    // One and only one mutating request; no app settings, tariffs or environment changes.
    deployment = (await request(path + '/deploy', { commit_sha: sha })).deploy;
  }
  if (!deployment?.id || deployment.commit_sha !== sha ||
      (internalAppId && deployment.app_id !== internalAppId)) {
    throw new Error('The deployment response did not match the selected app and commit.');
  }
  const started = Date.now();
  let previousStatus;
  for (;;) {
    if (deployment.status !== previousStatus) {
      log(`Deployment status: ${pending.has(deployment.status) || terminal.has(deployment.status) || deployment.status === 'success' ? deployment.status : 'unknown'}.`);
      previousStatus = deployment.status;
    }
    if (deployment.status === 'success') break;
    if (terminal.has(deployment.status)) throw new Error(`Timeweb deployment finished with status ${deployment.status}. Check the deployment log in Timeweb.`);
    if (!pending.has(deployment.status)) throw new Error('Unknown Timeweb deployment status; no additional deployment was started.');
    if (Date.now() - started > timeoutMs) throw new Error('Deployment is still pending after the monitoring timeout. It was not cancelled.');
    await sleep(10000);
    const latest = (await request(path + '/deploys?limit=100')).deploys;
    deployment = latest?.find(d => d.id === deployment.id);
    if (!deployment || deployment.commit_sha !== sha ||
        (internalAppId && deployment.app_id !== internalAppId)) {
      throw new Error('The monitored deployment could not be verified.');
    }
  }
  const finalApp = (await request(path)).app;
  if (String(finalApp?.id) !== String(app.id) || finalApp.commit_sha !== sha) {
    throw new Error('Timeweb reported success, but the app commit could not be verified.');
  }
  log(`Timeweb confirmed deployment ${deployment.id} for ${sha}.`);
  // Public smoke checks use a new request without the Timeweb Authorization header.
  const pages = ['/', '/catalog/', '/library/', '/news/', '/novel/the-latency-of-tomorrow/', '/account/'];
  for (const route of pages) {
    let healthy = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await fetchImpl(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) });
        const html = await response.text();
        healthy = response.ok && /<html\b[^>]*lang="en"/.test(html) && html.includes('Hunmeng') && html.includes('id="main"');
        if (route === '/') healthy &&= html.includes('home-hero') && html.includes('Browse genres');
      } catch { /* A new deployment can take a short time to reach the public edge. */ }
      if (healthy) break;
      if (attempt < 5) await sleep(10000);
    }
    if (!healthy) throw new Error(`Deployment succeeded, but the public page check failed: ${route}`);
    log(`Public page OK: ${route}`);
  }
  for (const name of ['reading-landscape', 'library-empty']) {
    let response;
    try { response = await fetchImpl(`${origin}/images/${name}.webp`, { redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`Deployment succeeded, but the public image check failed: ${name}`); }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error(`Deployment succeeded, but the public image check failed: ${name}`);
    }
  }
  log(`Verified Hunmeng: ${origin}/`);
  return { appId: String(app.id), deployId: deployment.id, commit: sha, url: origin + '/' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployTimeweb({ token: process.env.TIMEWEB_API_TOKEN, sha: process.env.DEPLOY_SHA })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
