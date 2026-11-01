// Publish historically sourced public-domain book artwork, not modern imitations.
// An image is only accepted after source provenance AND a Commons PD license check.
// No novel text, authors, chapters or author rights flags are modified.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const source = JSON.parse(fs.readFileSync('src/data/historical-cover-sources.json', 'utf8'));
const checkSlugs = new Set();
const records = [];
const MAX_BYTES = 20_000_000;
const ua = 'HunmengHistoricalCovers/1.0 (https://hunmeng-novel.ru; cover provenance and public domain audit)';
const today = '2026-11-01';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async url => {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try { response = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json, image/*;q=0.9' }, signal: AbortSignal.timeout(60000) }); }
    catch (error) { if (attempt === 2) throw error; await sleep(700 * (attempt + 1)); continue; }
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2)
      throw new Error('Source returned HTTP ' + response.status);
    await sleep(1200 * (attempt + 1));
  }
  throw new Error('Source unavailable');
};
const pdMetadata = raw => {
  const m = raw || {};
  const license = String(m.LicenseShortName?.value || m.License?.value || '');
  const terms = String(m.UsageTerms?.value || '');
  const copyright = String(m.Copyrighted?.value || '').toLowerCase();
  return (/\bpublic domain\b|^pd\b|^cc0\b/i.test(license) || /public domain/i.test(terms)) &&
    !['true','1'].includes(copyright);
};
const escapeHtml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

async function copyCover(entry) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) || typeof entry.file !== 'string'
    || !/^[\w .(),'’;-]+\.(?:jpg|jpeg|png|webp|JPG)$/.test(entry.file)
    || !Number.isInteger(entry.year) || entry.year > 1930 || entry.year < 1700
    || !entry.expectedAuthor || !entry.kind || checkSlugs.has(entry.slug))
    throw new Error('Unapproved or duplicate historical cover source ' + entry.slug);
  checkSlugs.add(entry.slug);
  const metaPath = 'src/content/novels/' + entry.slug + '.json';
  const novel = JSON.parse(fs.readFileSync(metaPath,'utf8'));
  if (novel.slug !== entry.slug || novel.author !== entry.expectedAuthor ||
      !novel.tags.includes('Public Domain'))
    throw new Error('Novel not in approved public-domain collection: ' + entry.slug);
  const outputUrl = '/images/covers/' + entry.slug + '-historical.webp';
  const outputFile = 'public' + outputUrl;
  if (novel.cover === outputUrl && fs.existsSync(outputFile)) {
    console.log('ALREADY_SYNCED '+entry.slug);return null;
  }
  if (novel.cover !== '/images/novel-placeholder.svg')
    throw new Error('Novel has another cover; refusing to overwrite ' + entry.slug);

  const title = 'File:' + entry.file;
  const wiki = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title).replaceAll('%3A', ':');
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    titles: title, prop: 'imageinfo',
    iiprop: 'url|size|sha1|mime|extmetadata',
  }).toString();
  const doc = await (await request(api)).json();
  const page = doc.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!info || page.missing || !pdMetadata(info.extmetadata))
    throw new Error('Historical cover lacks a verifiable Commons public-domain license: ' + entry.file);
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime) ||
      info.size < 8000 || info.size > MAX_BYTES ||
      !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(info.url) ||
      !/^[a-f0-9]{40}$/i.test(info.sha1))
    throw new Error('Unexpected Commons image format, URI or source digest: ' + entry.file);

  const bytes = Buffer.from(await (await request(info.url)).arrayBuffer());
  if (bytes.length !== info.size || createHash('sha1').update(bytes).digest('hex') !== info.sha1)
    throw new Error('Downloaded image checksum mismatch for ' + entry.file);
  const img = sharp(bytes, { failOn: 'error', limitInputPixels: 50_000_000 });
  const dimensions = await img.metadata();
  if ((dimensions.width || 0) < 280 || (dimensions.height || 0) < 390)
    throw new Error('Historical image too low resolution to use as a cover: '+entry.file);

  const output = await img.rotate().resize({width:950,withoutEnlargement:true}).webp({quality:84,effort:5}).toBuffer();
  if (output.length > 2_500_000) throw new Error('Optimized cover exceeds performance budget');
  fs.mkdirSync(path.dirname(outputFile),{recursive:true});
  fs.writeFileSync(outputFile,output);
  novel.cover = outputUrl;
  fs.writeFileSync(metaPath,JSON.stringify(novel,null,2)+'\n');
  const rights = String(info.extmetadata?.LicenseShortName?.value || info.extmetadata?.License?.value || '');
  console.log('HISTORICAL_COVER '+entry.slug+' '+entry.year+' '+bytes.length+' -> '+output.length+' license='+rights);
  return {
    slug:entry.slug, title:novel.title, originalYear:entry.year, kind:entry.kind,
    depictionType:entry.sourceType, license:rights, attribution: entry.credit || null,
    commonsFile:entry.file, sourcePage:wiki, sha1:info.sha1,
    originalBytes:info.size, originalMime:info.mime, optimizedBytes:output.length,
    image:outputUrl,
  };
}
if (source.covers.length !== 9) throw new Error('Expected 9 human-reviewed historical sources');
for(const entry of source.covers) {
  const record = await copyCover(entry);
  if (record) records.push(record);
}
if (!records.length) {
  console.log('NO_NEW_COVERS');
  process.exit(0);
}
if (records.length !== 9)throw Error('Expected all 9 covers for this first batch. Partial release blocked.');
const provenance='src/data/historical-covers-provenance.json';
fs.writeFileSync(provenance,JSON.stringify({checkedAt:today,origin:'Wikimedia Commons',covers:records},null,2)+'\n');

const slug='src/content/news/historical-covers-first-classics-2026-11-01.md';
if(fs.existsSync(slug))throw Error('Existing cover batch announcement, no overwrite.');
const item = [
  '---',
  'title: "Historic covers for nine classic novels"',
  'excerpt: "Nine classic books now feature verified public-domain artwork from their original or early editions, replacing generic catalog placeholders."',
  'category: changelog',
  'publishedAt: "2026-11-01"',
  'order: 1260',
  'cover: "/images/covers/dracula-historical.webp"',
  'coverAlt: "Original yellow binding of Bram Stoker’s 1897 Dracula"',
  'coverFit: art',
  '---','','Nine public-domain classics in the Hunmeng library now display authentic historical images from original or early editions, drawn from Wikimedia Commons.',
  '','The update replaces generic placeholder artwork. **Frankenstein** and **Treasure Island** use historical **title pages**, rather than claiming those scans are original front-board covers.',
  '','### Updated books','',
  ...records.map(r=>'- ['+escapeHtml(r.title)+'](/novel/'+r.slug+'/) — '+r.originalYear+' '+r.kind+' ([source]('+r.sourcePage+'))'),
  '','Only the cover assets and their book metadata were changed. All chapter texts, reading progress, and other reader features remain unchanged.',
  '','[Explore the catalog](/catalog/)','',''];
fs.writeFileSync(slug,item.join('\n'));
console.log('COMPLETE_HISTORICAL_COVERS='+records.length);
