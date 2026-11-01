// Batch import of supplied, licensed manuscript text. Never fetch chapters from URLs.
// This module intentionally has no network calls or publishing side effects.
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const accepted = new Set(['chapter_number', 'chapter_slug', 'chapter_title', 'chapter_description', 'original_text', 'translated_text']);
export function rightsVerified(source, now = new Date().toISOString().slice(0, 10)) {
  return Boolean(source && source.rights_status === 'verified' &&
    source.permission_translate === true && source.permission_publish === true &&
    source.verified_at && String(source.rights_evidence ?? '').trim().length >= 20 &&
    (!source.rights_valid_until || source.rights_valid_until >= now));
}
export function parseLicensedChapterBatch(raw) {
  if (typeof raw !== 'string' || raw.length > 600000) throw new Error('Batch must be JSON up to 600 KB.');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Enter valid JSON containing a chapters array.'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' ||
      Object.keys(parsed).some(key => key !== 'chapters') ||
      !Array.isArray(parsed.chapters) || parsed.chapters.length < 1 || parsed.chapters.length > 10)
    throw new Error('Provide an object with 1–10 chapters.');
  const numbers = new Set();
  const slugs = new Set();
  return parsed.chapters.map((chapter, i) => {
    if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter) ||
        Object.keys(chapter).some(key => !accepted.has(key)))
      throw new Error('Chapter ' + (i + 1) + ': unsupported or missing fields.');
    const { chapter_number: number, chapter_slug: path,
      chapter_title: title, chapter_description: summary, original_text: original,
      translated_text: translation = '' } = chapter;
    if (!Number.isSafeInteger(number) || number < 1 || number > 100000 ||
        typeof path !== 'string' || !slug.test(path) ||
        typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 200 ||
        typeof summary !== 'string' || summary.trim().length < 10 || summary.trim().length > 200 ||
        typeof original !== 'string' || original.trim().length < 80 || original.length > 300000 ||
        typeof translation !== 'string' || translation.length > 300000 ||
        (translation.trim() && translation.trim().length < 80))
      throw new Error('Chapter ' + (i + 1) + ': invalid number, slug, title, description or text length.');
    if (numbers.has(number) || slugs.has(path)) throw new Error('Duplicate chapter number or slug in batch.');
    numbers.add(number);
    slugs.add(path);
    return {
      chapter_number: number, chapter_slug: path,
      chapter_title: title.trim(), chapter_description: summary.trim(),
      original_text: original.trim(), translated_text: translation.trim(),
      status: 'draft',
    };
  });
}
