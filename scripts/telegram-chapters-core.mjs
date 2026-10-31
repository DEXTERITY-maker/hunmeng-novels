/** Pure, offline-testable decision and formatting helpers. No Telegram or Supabase calls. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const chapterNumber = n => Number.isSafeInteger(n) && n > 0;
export function chapterKey(chapter) {
  if (!SLUG.test(chapter.novelSlug ?? '') || !chapterNumber(chapter.number))
    throw new Error('Invalid chapter identity');
  return `${chapter.novelSlug}:${chapter.number}`;
}
export function chapterLink(chapter, origin = 'https://hunmeng-novel.ru') {
  const key = chapterKey(chapter);
  if (!/^https:\/\/[^/?#]+$/.test(origin)) throw new Error('Invalid site origin');
  const slug = chapter.slug || `chapter-${chapter.number}`;
  if (!SLUG.test(slug)) throw new Error('Invalid chapter slug');
  return `${origin}/novel/${chapter.novelSlug}/${slug}/`;
}
export function announcement(chapter, origin) {
  chapterKey(chapter);
  const clean = value => String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const novel = clean(chapter.novelTitle);
  const title = clean(chapter.title);
  if (!novel || !title) throw new Error('Missing chapter title');
  return `${novel}\nChapter ${chapter.number}: ${title}\nNew chapter is out on Hunmeng\n${chapterLink(chapter, origin)}`;
}
export function decideChapters(state, published) {
  if (!Array.isArray(published)) throw new Error('Published chapter source unavailable');
  const seen = new Map();
  for (const chapter of published) {
    const key = chapterKey(chapter);
    if (!seen.has(key)) seen.set(key, chapter);
    else if (seen.get(key).slug !== chapter.slug || seen.get(key).title !== chapter.title)
      throw new Error(`Conflicting public chapter: ${key}`);
  }
  const baseline = !state || state.initialized !== true;
  const stored = state?.chapters ?? {};
  const chapters = [...seen.values()].sort((a, b) => a.novelSlug.localeCompare(b.novelSlug) || a.number - b.number);
  const pending = chapters.filter(chapter => !Object.hasOwn(stored, chapterKey(chapter)));
  return { baseline, pending: baseline ? [] : pending, mark: baseline ? chapters : [] };
}
export function applyChapterMarker(state, chapter, status) {
  const key = chapterKey(chapter);
  if (!['baseline', 'reserved', 'sent'].includes(status)) throw new Error('Invalid marker status');
  return {
    version: 1, initialized: true, deployedSha: state?.deployedSha ?? null,
    chapters: {...(state?.chapters ?? {}), [key]: {
      status, slug: chapter.slug, title: chapter.title, novelTitle: chapter.novelTitle,
    }},
  };
}
export function parseChapterMarkdown(markdown, fallbackNovelSlug) {
  if (typeof markdown !== 'string' || !markdown.startsWith('---\n')) throw new Error('Missing chapter front matter');
  const stop = markdown.indexOf('\n---', 4);
  if (stop < 0) throw new Error('Incomplete chapter front matter');
  const fields = {};
  for (const line of markdown.slice(4, stop).split('\n')) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    fields[m[1]] = value.startsWith('"') && value.endsWith('"') ? JSON.parse(value) :
      value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
  }
  const chapter = {
    novelSlug: fields.novelSlug || fallbackNovelSlug,
    number: Number(fields.number), slug: fields.slug, title: fields.title,
  };
  chapterKey(chapter);
  if (!SLUG.test(chapter.slug ?? '') || typeof chapter.title !== 'string' || !chapter.title.trim())
    throw new Error('Invalid chapter front matter');
  return chapter;
}
export function validateReleasedChapters(editions, rows) {
  if (!Array.isArray(editions) || !Array.isArray(rows)) throw new Error('Supabase unavailable');
  const result = [];
  for (const edition of editions) {
    if (!SLUG.test(edition.slug ?? '') || !chapterNumber(edition.initial_chapters))
      throw new Error('Invalid serial edition');
    const own = rows.filter(row => row.novel_slug === edition.slug);
    if (edition.launch_at && own.length < edition.initial_chapters)
      throw new Error('Incomplete Supabase public release response');
    for (const row of own) {
      if (!chapterNumber(row.number) || typeof row.title !== 'string' || !row.title.trim())
        throw new Error('Invalid public serial chapter');
      if (row.number > edition.initial_chapters)
        result.push({novelSlug: edition.slug, number: row.number, slug: `chapter-${row.number}`, title: row.title});
    }
  }
  if (rows.some(row => !editions.some(edition => edition.slug === row.novel_slug)))
    throw new Error('Unrecognized public serial chapter');
  return result;
}
/** Reserve BEFORE sending. An ambiguous Telegram failure stays reserved. */
export async function deliverChapters(state, chapters, {persist, send}) {
  let current = state;
  for (const chapter of chapters) {
    const key = chapterKey(chapter);
    if (Object.hasOwn(current.chapters ?? {}, key)) continue;
    const reserved = applyChapterMarker(current, chapter, 'reserved');
    await persist(reserved);
    current = reserved;
    const message = await send(chapter);
    const sent = applyChapterMarker(current, chapter, 'sent');
    sent.chapters[key].messageId = message?.message_id ?? null;
    await persist(sent);
    current = sent;
  }
  return current;
}
