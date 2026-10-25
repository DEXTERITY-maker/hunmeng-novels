import type { Novel } from './content';

export function socialCover(cover: string) {
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
  { name: 'Главная', path: '/' },
  { name: 'Каталог', path: '/catalog/' },
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
    inLanguage: 'ru',
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
        headline: `${n.title} — глава ${chapter.data.number}: ${chapter.data.title}`,
        description: chapter.data.description,
        inLanguage: 'ru',
        position: chapter.data.number,
        datePublished: chapter.data.publishedAt,
        image: abs(socialCover(n.cover), base),
        isPartOf: { '@id': abs(n.url, base) + '#book', '@type': 'Book', name: n.title },
      },
      breadcrumbs(
        [...root, { name: n.title, path: n.url }, { name: `Глава ${chapter.data.number}: ${chapter.data.title}`, path: page }],
        base, page,
      ),
    ],
  };
}
/** HTTPS URL or template like https://t.me/YourBot?start=err_{novel}_{chapter}. */
export function chapterReportUrl(template: string, novelSlug: string, chapterSlug: string): string | null {
  if (!template.trim()) return null;
  const filled = template.replaceAll('{novel}', encodeURIComponent(novelSlug))
    .replaceAll('{chapter}', encodeURIComponent(chapterSlug));
  try {
    const uri = new URL(filled);
    if (uri.protocol !== 'https:') return null;
    return uri.href;
  } catch { return null; }
}
