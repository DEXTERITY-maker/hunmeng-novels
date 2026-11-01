import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateConfig, providerUrl, chapterUrl, syncLicensedSource } from './chapter-sync-core.mjs';

// Server-only runner: never put SUPABASE_SERVICE_ROLE_KEY in Astro/browser code.
const project = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const execute = process.env.HUNMENG_CHAPTER_SYNC_EXECUTE === 'true';
const enabled = process.env.HUNMENG_CHAPTER_SYNC_ENABLED === 'true';
const configFile = fileURLToPath(new URL('./chapter-sync-sources.json', import.meta.url));

async function requestJson(url, { headers = {}, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method, headers: { Accept: 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error', credentials: 'omit', cache: 'no-store',
    referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url.startsWith(project) ? 'Supabase' : 'licensed feed'}`);
  if (!(res.headers.get('content-type') || '').toLowerCase().includes('application/json'))
    throw new Error('Expected JSON response');
  const chunks = [];
  let bytes = 0;
  for await (const part of res.body) {
    bytes += part.byteLength;
    if (bytes > 1100000) throw new Error('Response exceeded 1.1 MB limit');
    chunks.push(Buffer.from(part));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON response'); }
}

function supabasePath(table, query) {
  return `${project}/rest/v1/${table}?${query}`;
}
function restHeaders() {
  return { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
}
async function rest(table, query, method = 'GET', body) {
  return requestJson(supabasePath(table, query), { method, body, headers: restHeaders() });
}
async function readSource(slug) {
  const rows = await rest('novel_sources', `slug=eq.${encodeURIComponent(slug)}&select=*`);
  if (!Array.isArray(rows)) throw new Error('Invalid Supabase source response');
  return rows[0] ?? null;
}
async function existingNumbers(sourceId, numbers) {
  if (!numbers.length) return new Set();
  if (!/^[a-f0-9-]{36}$/i.test(sourceId)) throw new Error('Invalid source ID');
  const query = `source_id=eq.${sourceId}&chapter_number=in.(${numbers.join(',')})&select=chapter_number`;
  const rows = await rest('novel_translation_jobs', query);
  if (!Array.isArray(rows)) throw new Error('Invalid chapter lookup response');
  return new Set(rows.map(row => row.chapter_number));
}
async function insertDraft(sourceId, chapter) {
  const rows = await rest('novel_translation_jobs', 'on_conflict=source_id,chapter_number',
    'POST', { source_id: sourceId, ...chapter });
  if (!Array.isArray(rows)) throw new Error('Invalid insert response');
  return rows.length === 1;
}

async function main() {
  const config = validateConfig(JSON.parse(await readFile(configFile, 'utf8')));
  if (!config.length) {
    console.log('No licensed API providers configured; no calls and no imports.');
    return;
  }
  if (execute && !enabled) throw new Error('Execution requires HUNMENG_CHAPTER_SYNC_ENABLED=true');
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(project) || !secret)
    throw new Error('Missing server-side Supabase configuration');
  const adapter = {
    readSource,
    existingNumbers,
    insertDraft,
    listPage: (source, cursor) => requestJson(providerUrl(source, source.listPath, cursor)),
    loadChapter: (source, id) => requestJson(chapterUrl(source, id)),
  };
  let failed = 0;
  for (const source of config) {
    try {
      const result = await syncLicensedSource(source, adapter, { dryRun: !execute });
      console.log(JSON.stringify(result));
    } catch (error) {
      failed++;
      // Never log provider response bodies, credentials or manuscript text.
      console.error(`Source ${source.slug} failed: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}
await main();
