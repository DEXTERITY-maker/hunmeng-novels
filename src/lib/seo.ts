import type { Novel } from './content';

// The generic placeholder cover has no social PNG: link previews fall back to the site's default image.
export const placeholderCover = '/images/novel-placeholder.svg';
export function socialCover(cover: string) {
  if (cover === placeholderCover) return '/images/og-default.png';
  return cover.endsWith('.svg') ? cover.slice(0, -4) + '-og.png' : cover;
}
function abs(path: string, base: URL | string) {
  return new URL(path, base).href;
}
function breadcrumbs(items: Array<{ name: string; path: string }>, base: URL | string, page: string) {
  return {
    '@type': 'BreadcrumbList',
    '@id': abs(page, base) + '#breadcrumbs',
    itemListElement: items.map(({ name, path }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: abs(path, base),
    })),
  };
}
const root = [
  { name: 'Home', path: '/' },
  { name: 'Catalog', path: '/catalog/' },
];
function book(n: Novel, base: URL | string) {
  const bookUrl = abs(n.url, base);
  return {
    '@type': 'Book',
    '@id': bookUrl + '#book',
    url: bookUrl,
    name: n.title,
    alternateName: n.originalTitle,
    description: n.description,
    inLanguage: 'en',
    image: abs(socialCover(n.cover), base),
    author: {
      '@type': 'Person',
      name: n.author,
      ...(n.authorUrl ? { url: n.authorUrl } : {}),
    },
    genre: n.genres,
    dateModified: n.updatedAt,
    isAccessibleForFree: true,
  };
}
export function novelStructuredData(n: Novel, base: URL | string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      book(n, base),
      breadcrumbs([...root, { name: n.title, path: n.url }], base, n.url),
    ],
  };
}
export function chapterStructuredData(
  n: Novel,
  chapter: Novel['chapters'][number],
  base: URL | string,
) {
  const page = `/novel/${n.slug}/${chapter.data.slug}/`;
  const chapterUrl = abs(page, base);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Chapter',
        '@id': chapterUrl + '#chapter',
        url: chapterUrl,
        name: chapter.data.title,
        headline: `${n.title} — chapter ${chapter.data.number}: ${chapter.data.title}`,
        description: chapter.data.description,
        inLanguage: 'en',
        position: chapter.data.number,
        datePublished: chapter.data.publishedAt,
        image: abs(socialCover(n.cover), base),
        isPartOf: { '@id': abs(n.url, base) + '#book', '@type': 'Book', name: n.title },
      },
      breadcrumbs(
        [...root, { name: n.title, path: n.url }, { name: `Chapter ${chapter.data.number}: ${chapter.data.title}`, path: page }],
        base, page,
      ),
    ],
  };
}
/** Telegram deep link. reportUrl must be https://t.me/<bot> without query parameters.
 * Telegram start accepts only [A-Za-z0-9_-] and at most 64 characters.
 * Return null for invalid configuration, slug, chapter number, or long payload.
 */
export function chapterReportUrl(reportUrl: string, novelSlug: string, chapterNumber: number): string | null {
  if (!reportUrl.trim()) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(novelSlug)) return null;
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) return null;
  const payload = `e_${novelSlug}_${chapterNumber}`;
  if (payload.length > 64 || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  try {
    const uri = new URL(reportUrl);
    if (uri.protocol !== 'https:' || uri.hostname !== 't.me' ||
        uri.username || uri.password || uri.port || uri.search || uri.hash ||
        !/^\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(uri.pathname)) return null;
    uri.pathname = uri.pathname.replace(/\/$/, '');
    uri.searchParams.set('start', payload);
    return uri.href;
  } catch { return null; }
}
