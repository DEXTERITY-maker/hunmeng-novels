// Reader-facing publication notes are produced only for authorized works and
// chapters by publish-approved.mjs, in the SAME commit as the approved content.
// This module does not read Git history or create technical release announcements.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validDate = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function clean(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f<>{}[\]*_#\\]/g, '')
    .replaceAll(String.fromCharCode(96), '').replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
}
export function makePublicationNews(input) {
  const { kind, novelSlug, novelTitle, chapterSlug, chapterNumber, chapterTitle, date } = input;
  if (!slugPattern.test(novelSlug) || !validDate(date))
    throw new Error('Invalid novel slug or date');
  const novel = clean(novelTitle);
  if (!novel) throw new Error('Novel title is required');
  let name, title, excerpt, details;
  if (kind === 'novel') {
    name = 'publication-novel-' + novelSlug + '.md';
    title = 'Новая новелла: ' + novel;
    excerpt = 'В библиотеке «Хунмэнг» опубликована новелла «' + novel +
      '». Откройте страницу произведения, чтобы начать чтение.';
    details = 'В библиотеке «Хунмэнг» появилась новая новелла **«' + novel +
      '»**.\n\n[Открыть произведение](/novel/' + novelSlug + '/).';
  } else if (kind === 'chapter') {
    if (!slugPattern.test(chapterSlug) || !Number.isSafeInteger(chapterNumber) || chapterNumber < 1)
      throw new Error('Invalid chapter slug or number');
    const chapter = clean(chapterTitle);
    if (!chapter) throw new Error('Chapter title is required');
    name = 'publication-chapter-' + novelSlug + '--' + chapterSlug + '.md';
    title = 'Новая глава: ' + novel + ' — ' + chapterNumber;
    excerpt = 'Для новеллы «' + novel + '» опубликована глава ' + chapterNumber +
      ': «' + chapter + '». Продолжайте чтение на сайте.';
    details = 'Опубликована **глава ' + chapterNumber + '. ' + chapter + '** новеллы «' +
      novel + '».\n\n[Читать главу](/novel/' + novelSlug + '/' + chapterSlug + '/).';
  } else {
    throw new Error('Unsupported publication type');
  }
  return {
    name,
    content: [
      '---',
      'title: ' + JSON.stringify(title),
      'excerpt: ' + JSON.stringify(excerpt.slice(0, 230)),
      'category: announcements',
      'publishedAt: ' + JSON.stringify(date),
      'order: ' + (kind === 'novel' ? 20 : 10),
      '---',
      '',
      details,
      '',
    ].join('\n'),
  };
}
