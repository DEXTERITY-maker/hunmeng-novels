// Read-only discovery helpers. No DaoSearch metadata grants publishing rights.
export const DAOSEARCH_SOURCES = Object.freeze(['qidian','fanqie','jjwxc','faloo','qimao','zongheng']);
const canonicalString = value => typeof value === 'string' ? value.trim() : '';
export const normalized = value => canonicalString(value).normalize('NFKC').toLowerCase()
  .replace(/[\p{P}\p{S}\p{Z}\s]+/gu, '');
const safeHttps = value => {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    u.hash = '';
    u.searchParams.sort();
    return u.href.replace(/\/$/,'');
  } catch { return null; }
};
export function makeCandidate(book) {
  const source = canonicalString(book?.source).toLowerCase();
  const sourceBookId = canonicalString(book?.source_book_id);
  if (!DAOSEARCH_SOURCES.includes(source) || !/^[0-9A-Za-z_-]{1,80}$/.test(sourceBookId))
    throw new Error('DaoSearch returned an invalid source or book identifier');
  const daosearchUrl = safeHttps(book?.url);
  if (!daosearchUrl || new URL(daosearchUrl).hostname !== 'daosearch.io')
    throw new Error('DaoSearch returned an invalid book link');
  const link = safeHttps(book?.source_url);
  const names = [book?.title?.en, book?.title?.zh,
    ...(Array.isArray(book?.other_names) ? book.other_names.flatMap(x => [x?.name, x?.name_translated]) : [])]
    .map(canonicalString).filter(Boolean);
  const authors = [book?.author?.en, book?.author?.zh].map(canonicalString).filter(Boolean);
  return {
    id: source + ':' + sourceBookId, source, source_book_id: sourceBookId,
    title: canonicalString(book?.title?.en || book?.title?.zh) || '(untitled)',
    original_title: canonicalString(book?.title?.zh), author: authors[0] || '',
    names: [...new Set(names)], authors, daosearch_url: daosearchUrl, source_url: link,
    availability: canonicalString(book?.availability?.state) || 'unknown',
  };
}
export function sourceKeyFromUrl(url) {
  const safe = safeHttps(url);
  if (!safe) return null;
  const u = new URL(safe), host = u.hostname.replace(/^www\./,'');
  const path = u.pathname;
  let match = null;
  if (['fanqienovel.com','fanqienovel.cn'].includes(host)) match = path.match(/^\/page\/(\d+)/);
  else if (host === 'qidian.com') match = path.match(/\/book\/(\d+)/);
  else if (host.endsWith('.jjwxc.net') || host === 'jjwxc.net') match = u.searchParams.get('novelid')?.match(/^(\d+)$/);
  if (!match) return null;
  return (host.includes('fanqie') ? 'fanqie' : host.includes('qidian') ? 'qidian' : 'jjwxc') + ':' + match[1];
}
function localNames(entry) {
  return [entry?.title, entry?.originalTitle, entry?.original_title,
    entry?.title_ru, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
    .map(normalized).filter(Boolean);
}
function localAuthors(entry) {
  return [entry?.author, entry?.author_name].map(normalized).filter(Boolean);
}
// Returns potential matches with reasons rather than silently deduplicating/rejecting works.
export function checkDuplicates(candidate, existing) {
  const ct = new Set(candidate.names.map(normalized).filter(Boolean));
  const ca = new Set(candidate.authors.map(normalized).filter(Boolean));
  const matches = [];
  for (const item of existing) {
    const titles = localNames(item), authors = localAuthors(item);
    const titleMatch = titles.some(t => ct.has(t));
    const authorMatch = authors.some(a => ca.has(a));
    const daoId = canonicalString(item.daosearch_id || item.externalId);
    const directId = daoId === candidate.id;
    const idFromUrl = sourceKeyFromUrl(item.originalUrl || item.original_url);
    const sourceId = idFromUrl === candidate.id;
    const existingUrl = safeHttps(item.originalUrl || item.original_url);
    const exactUrl = Boolean(existingUrl && candidate.source_url && existingUrl === candidate.source_url);
    let reason = null, certainty = null;
    if (directId || sourceId || exactUrl) {reason = 'source_id_or_url';certainty = 'exact';}
    else if (titleMatch && authorMatch) {reason = 'title_and_author';certainty = 'exact';}
    else if (titleMatch) {reason = 'matching_title_review_author';certainty = 'probable';}
    if (reason) matches.push({
      location: item.location || 'catalog', slug: canonicalString(item.slug),
      title: canonicalString(item.title || item.title_ru || item.original_title),
      reason, certainty,
    });
  }
  matches.sort((a,b) => Number(b.certainty === 'exact') - Number(a.certainty === 'exact'));
  return {
    status: matches.some(m => m.certainty === 'exact') ? 'known'
      : matches.length ? 'review' : 'new',
    matches: matches.slice(0,10),
  };
}
export function reportRow(candidate, review) {
  return {
    id:candidate.id, title:candidate.title,
    original_title:candidate.original_title, author:candidate.author,
    source:candidate.source, source_url:candidate.source_url,
    daosearch_url:candidate.daosearch_url, availability:candidate.availability,
    duplicate_status:review.status, matches:review.matches,
    publication_rights:'not_verified', chapter_import_allowed:false,
  };
}
