// Server-only DaoSearch lookup for Hunmeng editorial research.
// No browser calls, no catalogue crawling, no copied cover art or chapter text.
// DaoSearch terms: cite its book URL with every displayed result; never expose the key.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { externalNovels } from '../src/data/external-novels.ts';
import { DAOSEARCH_SOURCES, makeCandidate, checkDuplicates, reportRow } from '../src/lib/daosearch-discovery.mjs';
const API = 'https://daosearch.io/api/v1';
const USER_AGENT = 'HunmengNovelResearch/1.0 (https://hunmeng-novel.ru)';
const MAX_DETAILS = 5;
const timeoutMs = 15000;
function getInput(env = process.env) {
  const query = (env.DAOSEARCH_QUERY || '').trim();
  const author = (env.DAOSEARCH_AUTHOR || '').trim();
  const source = (env.DAOSEARCH_SOURCE || 'all').toLowerCase();
  if (Boolean(query) === Boolean(author)) throw new Error('Provide either a title/URL query OR an author, not both.');
  if (query.length > 300 || author.length > 120) throw new Error('Search input is too long.');
  if (query && !(/^https:\/\//i.test(query) || query.length >= 3 || /[\p{Script=Han}]/u.test(query)))
    throw new Error('A Latin-letter search needs at least three characters.');
  if (source !== 'all' && !DAOSEARCH_SOURCES.includes(source)) throw new Error('Unsupported DaoSearch source.');
  return { query, author, source };
}
function fetchPath(url, base, headers, fetcher) {
  const endpoint = new URL(url, base);
  if (endpoint.origin !== new URL(base).origin || !endpoint.pathname.startsWith('/api/v1/'))
    throw new Error('Refusing to send a secret to an unexpected destination.');
  return fetcher(endpoint, { method:'GET', redirect:'manual', headers,
    signal:AbortSignal.timeout(timeoutMs) });
}
export async function apiGet(path, key, fetcher = fetch) {
  if (!key || key.length < 8) throw new Error('DAOSEARCH_KEY is not configured in GitHub Actions secrets.');
  const headers = { 'Authorization': 'Bearer ' + key, 'User-Agent': USER_AGENT, 'Accept':'application/json' };
  let response = await fetchPath(path, API+'/', headers, fetcher);
  // DaoSearch moves book records with 301; only follow same-origin API redirects.
  if ([301,302,307,308].includes(response.status)) {
    const location = response.headers?.get('location');
    if (!location) throw new Error('DaoSearch redirect without a location.');
    response = await fetchPath(location, API+'/', headers, fetcher);
  }
  if (response.status === 429) throw new Error('DaoSearch quota/rate limit reached. Try after Retry-After.');
  if (response.status === 401 || response.status === 403)
    throw new Error('DaoSearch authorization declined. Check account status and the secret in GitHub Settings.');
  if (!response.ok) throw new Error('DaoSearch lookup failed with HTTP '+response.status+'.');
  const body = await response.text();
  if (body.length > 900000) throw new Error('DaoSearch response exceeds the discovery limit.');
  let json;
  try { json = JSON.parse(body); } catch { throw new Error('DaoSearch response was not valid JSON.'); }
  if (!json || !('data' in json)) throw new Error('DaoSearch response did not contain data.');
  return json.data;
}
export async function readLocalIndex(root = process.cwd()) {
  const dir = path.join(root,'src/content/novels');
  const locals = fs.readdirSync(dir).filter(x => x.endsWith('.json')).map(file => {
    const book = JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
    return { ...book, location:'published_novel' };
  });
  return [...locals,...externalNovels.map(e => ({...e,location:'external_reference'}))];
}
async function readEditorialSources(env = process.env, fetcher = fetch) {
  const url = (env.SUPABASE_URL || '').replace(/\/+$/,'');
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !secret) return { complete:false, rows:[] };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))
    throw new Error('Configured Supabase URL is not a verified Supabase project domain.');
  const res = await fetcher(url+'/rest/v1/novel_sources?select=slug,original_title,title_ru,author_name,original_url&limit=500', {
    method:'GET', redirect:'error',
    headers:{apikey:secret,Authorization:'Bearer '+secret,'User-Agent':USER_AGENT,'Accept':'application/json'},
    signal:AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error('Unable to check protected editorial sources (HTTP '+res.status+').');
  const count = res.headers?.get('content-range') ?? '';
  const rows=await res.json();
  if(!Array.isArray(rows) || rows.length >500)throw new Error('Invalid editorial source list.');
  // A capped result must be treated as incomplete, not an exhaustive negative check.
  const total = count.match(/\/(\d+)$/)?.[1];
  return { complete: rows.length < 500 && (!total || Number(total) <=500),
    rows: rows.map(r=>({...r,location:'editorial_source'})) };
}
const escapeMarkdown = txt => String(txt ?? '').replace(/[\r\n|\x60<>\[\]]/g,' ').slice(0,170);
function markdownSummary(rows, coverage) {
  const report = ['### DaoSearch / Hunmeng: editorial-only lookup','','Source: [DaoSearch](https://daosearch.io/developers) · no chapter text imported.','',
    'Duplication coverage: **'+ (coverage?'local catalog + editorial database':'local catalog only — configure Supabase secrets for complete review') +'**.',
    ''];
  report.push('| Work (DaoSearch link) | Source | Duplicate check |','|---|---|---|');
  for (const row of rows) {
    const link = row.daosearch_url;
    const safeLink = new URL(link);
    if (safeLink.protocol !== 'https:' || safeLink.hostname !== 'daosearch.io') throw new Error('Invalid citation link.');
    report.push('| ['+escapeMarkdown(row.title)+']('+link+') | '+escapeMarkdown(row.source)+' | '+escapeMarkdown(row.duplicate_status)+ ' |');
  }
  report.push('', 'All search hits require editorial review and separate documentation of text/translation rights before publication.');
  return report.join('\n')+'\n';
}
export async function run(env = process.env, fetcher = fetch) {
  const {query, author, source} = getInput(env);
  const key = env.DAOSEARCH_KEY || '';
  if (!key) throw new Error('DAOSEARCH_KEY missing: create it in DaoSearch account settings and store it in GitHub Actions repository secrets (never in chat or source code).');
  const qs = new URLSearchParams(query?{q:query}:{author});
  if(source!=='all')qs.set('source',source);
  const result = await apiGet('/search?'+qs, key, fetcher);
  if(!Array.isArray(result) || result.length>30) throw new Error('Unexpected DaoSearch result count.');
  // Author search can return up to 30. Intentionally fetch at most five detailed records.
  const cards = result.slice(0,MAX_DETAILS);
  const local = await readLocalIndex();
  const database = await readEditorialSources(env,fetcher);
  const known=[...local,...database.rows];
  const rows=[];
  for(const item of cards) {
    const candidate = makeCandidate(item);
    const detail=await apiGet('/books/'+encodeURIComponent(candidate.source)+'/'+encodeURIComponent(candidate.source_book_id),key,fetcher);
    const full=makeCandidate(detail);
    const matches=checkDuplicates(full,known);
    rows.push(reportRow(full,matches));
  }
  const report={
    generated_at:new Date().toISOString(),
    query:query || null, author:author || null, source,
    data_provider:'DaoSearch', terms:'https://daosearch.io/developers',
    checked_local_catalog:true, checked_editorial_database:database.complete,
    duplicates_are_advisory:true, on_site_chapters_imported:0, rights_verification_performed:false,
    returned_total:result.length, examined:rows.length, results:rows,
  };
  const dest=env.DAOSEARCH_REPORT_PATH || '';
  if(dest) {
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  if(env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY,markdownSummary(rows,database.complete));
  console.log('DaoSearch lookup complete: '+rows.length+' candidates; exact duplicates='+
    rows.filter(x=>x.duplicate_status==='known').length+'; review='+
    rows.filter(x=>x.duplicate_status==='review').length+
    '; editorial DB checked='+database.complete+'. No novels or chapters published.');
  return report;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await run().catch(e=>{console.error('DaoSearch lookup: '+e.message);process.exitCode=1;});
