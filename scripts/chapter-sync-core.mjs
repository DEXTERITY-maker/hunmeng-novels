// Pure, testable sync logic. Full text is accepted only from explicitly licensed API sources.
// No arbitrary URL discovery, cross-origin redirects or auto-publication.
import { rightsVerified } from '../src/lib/authorized-chapter-batch.mjs';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathPattern = /^\/[A-Za-z0-9/_-]+$/;
const chapterIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PAGES = 10;
export const MAX_PER_RUN = 10;

function validExpiry(value) {
  return typeof value === 'string' && dayPattern.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateConfig(raw) {
  if (!raw || Array.isArray(raw) || !Array.isArray(raw.sources)) throw new Error('Missing sources array');
  if (raw.sources.length > 20) throw new Error('Too many licensed sources');
  const slugs = new Set();
  return raw.sources.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source) ||
        !slugPattern.test(source.slug ?? '') || slugs.has(source.slug))
      throw new Error('Invalid or duplicate source slug');
    slugs.add(source.slug);
    let url;
    try { url = new URL(source.baseUrl); } catch { throw new Error('Invalid source base URL'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/' || url.search || url.hash || host === 'localhost' ||
        !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
        /\.(local|internal|localhost|test|invalid|example)$/.test(host))
      throw new Error('Source must be a publicly hosted HTTPS origin');
    if (!pathPattern.test(source.listPath ?? '') ||
        !pathPattern.test(source.chapterPathPrefix ?? '') ||
        !source.chapterPathPrefix.endsWith('/') ||
        source.listPath.includes('//') || source.chapterPathPrefix.includes('//'))
      throw new Error('Unsafe provider API path');
    if (source.apiAccessConfirmed !== true ||
        source.republicationConfirmed !== true ||
        source.translationConfirmed !== true ||
        typeof source.licenseReference !== 'string' ||
        source.licenseReference.trim().length < 20 ||
        !validExpiry(source.licenseExpires))
      throw new Error('Documented API and chapter rights are mandatory');
    return { ...source, baseUrl: url.origin, licenseReference: source.licenseReference.trim() };
  });
}

export function licenseValid(source, now = new Date().toISOString().slice(0, 10)) {
  return source.apiAccessConfirmed === true && source.republicationConfirmed === true &&
    source.translationConfirmed === true && validExpiry(source.licenseExpires) &&
    source.licenseExpires >= now;
}

export function sourceCanImport(source, record, now) {
  return Boolean(record && record.slug === source.slug && rightsVerified(record, now) &&
    licenseValid(source, now));
}

export function providerUrl(source, path, cursor) {
  if (!pathPattern.test(path) || path.includes('//')) throw new Error('Unsafe provider path');
  const url = new URL(path, source.baseUrl);
  if (url.origin !== source.baseUrl) throw new Error('Unexpected provider host');
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 200)
      throw new Error('Invalid pagination cursor');
    url.searchParams.set('cursor', cursor);
  }
  return url.toString();
}

export function chapterUrl(source, id) {
  if (typeof id !== 'string' || !chapterIdPattern.test(id)) throw new Error('Invalid chapter ID');
  return providerUrl(source, source.chapterPathPrefix + id);
}

export function validateFeed(value) {
  if (!value || Array.isArray(value) || !Array.isArray(value.chapters) ||
      value.chapters.length > 100) throw new Error('Invalid chapter feed');
  const chapters = value.chapters.map((chapter) => {
    if (!chapter || typeof chapter.id !== 'string' || !chapterIdPattern.test(chapter.id) ||
        !Number.isSafeInteger(chapter.number) || chapter.number < 1 || chapter.number > 1000000 ||
        typeof chapter.title !== 'string' || chapter.title.trim().length < 1 ||
        chapter.title.trim().length > 200)
      throw new Error('Invalid chapter metadata');
    const description = typeof chapter.description === 'string' &&
      chapter.description.trim().length >= 10 && chapter.description.trim().length <= 200
      ? chapter.description.trim() : `Глава ${chapter.number} из лицензированного источника.`;
    return { id: chapter.id, number: chapter.number, title: chapter.title.trim(), description };
  });
  const numbers = chapters.map(c => c.number);
  const ids = chapters.map(c => c.id);
  if (new Set(numbers).size !== numbers.length || new Set(ids).size !== ids.length)
    throw new Error('Repeated chapter in one page');
  const nextCursor = value.next_cursor ?? null;
  if (nextCursor !== null && (typeof nextCursor !== 'string' ||
      !nextCursor.length || nextCursor.length > 200))
    throw new Error('Invalid next cursor');
  return { chapters, nextCursor };
}

export function validateFullChapter(value, meta) {
  if (!value || value.id !== meta.id || value.number !== meta.number ||
      typeof value.text !== 'string' || value.text.trim().length < 80 ||
      value.text.length > 300000)
    throw new Error('Chapter body does not match authorized metadata');
  const text = value.text.trim();
  if (/<\/?[a-z][^>]*>/i.test(text)) throw new Error('Expected plain-text licensed chapter');
  return {
    chapter_number: meta.number,
    chapter_slug: `chapter-${meta.number}`,
    chapter_title: meta.title,
    chapter_description: meta.description,
    original_text: text,
    translated_text: '',
    status: 'draft',
  };
}

/**
 * Adapter methods are injected to allow offline tests. Only a publisher-approved
 * source can be enumerated; rights are checked again immediately before each import.
 */
export async function syncLicensedSource(source, adapter, options = {}) {
  const dryRun = options.dryRun !== false;
  const maxImports = Math.min(Math.max(options.maxImports ?? MAX_PER_RUN, 1), MAX_PER_RUN);
  const now = options.now ?? new Date().toISOString().slice(0, 10);
  if (!licenseValid(source, now)) throw new Error('API access or reproduction license expired');
  const initial = await adapter.readSource(source.slug);
  if (!sourceCanImport(source, initial, now)) throw new Error('Publication rights are not verified');
  const summary = { slug: source.slug, discovered: 0, imported: 0, existing: 0, truncated: false, dryRun };
  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenCursors = new Set();
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const feed = validateFeed(await adapter.listPage(source, cursor));
    for (const chapter of feed.chapters) {
      if (seenIds.has(chapter.id) || seenNumbers.has(chapter.number))
        throw new Error('Duplicate or renumbered chapter in feed');
      seenIds.add(chapter.id);
      seenNumbers.add(chapter.number);
    }
    const existing = await adapter.existingNumbers(initial.id, feed.chapters.map(c => c.number));
    if (!(existing instanceof Set)) throw new Error('Invalid existing chapter lookup');
    for (const meta of feed.chapters) {
      if (existing.has(meta.number)) { summary.existing++; continue; }
      summary.discovered++;
      if (dryRun) continue;
      if (summary.imported >= maxImports) { summary.truncated = true; return summary; }
      const current = await adapter.readSource(source.slug);
      if (current.id !== initial.id || !sourceCanImport(source, current, now))
        throw new Error('Source rights changed during import');
      const full = validateFullChapter(await adapter.loadChapter(source, meta.id), meta);
      // The DB has unique (source_id, chapter_number): racing jobs cannot duplicate.
      const inserted = await adapter.insertDraft(initial.id, full);
      if (inserted) summary.imported++;
      else summary.existing++;
    }
    if (feed.nextCursor === null) return summary;
    if (seenCursors.has(feed.nextCursor)) throw new Error('Repeated pagination cursor');
    seenCursors.add(feed.nextCursor);
    cursor = feed.nextCursor;
  }
  summary.truncated = true;
  return summary;
}
