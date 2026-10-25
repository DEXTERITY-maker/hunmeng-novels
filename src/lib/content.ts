import { getCollection } from 'astro:content';
export { chapterCount } from './format';
export const novelUrl = (slug: string) => `/novel/${slug}/`;
export const chapterUrl = (novel: string, chapter: string) => `/novel/${novel}/${chapter}/`;
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}
export async function getLibrary() {
  const [novels, chapters, glossaries] = await Promise.all([
    getCollection('novels'),
    getCollection('chapters'),
    getCollection('glossaries'),
  ]);
  const slugs = new Set<string>();
  for (const { data: n } of novels) {
    if (slugs.has(n.slug)) throw new Error(`Повтор slug: ${n.slug}`);
    slugs.add(n.slug);
  }
  for (const { data: c } of chapters)
    if (!slugs.has(c.novelSlug)) throw new Error(`Глава без новеллы: ${c.novelSlug}`);
  for (const { data: g } of glossaries)
    if (!slugs.has(g.novelSlug)) throw new Error(`Глоссарий без новеллы: ${g.novelSlug}`);
  const result = novels.map(({ data: n }) => {
    const own = chapters
      .filter((c) => c.data.novelSlug === n.slug)
      .sort((a, b) => a.data.number - b.data.number);
    if (!own.length) throw new Error(`Нет глав: ${n.slug}`);
    const ids = new Set<string>(),
      numbers = new Set<number>();
    for (const c of own) {
      if (ids.has(c.data.slug) || numbers.has(c.data.number))
        throw new Error(`Дубликат главы: ${n.slug}`);
      ids.add(c.data.slug);
      numbers.add(c.data.number);
    }
    const ownGlossaries = glossaries.filter((g) => g.data.novelSlug === n.slug);
    if (ownGlossaries.length !== 1)
      throw new Error(`Нужен один глоссарий: ${n.slug}`);
    const updatedAt = [n.updatedAt, ...own.map((c) => c.data.publishedAt)].sort().at(-1)!;
    return {
      ...n,
      updatedAt,
      chapters: own,
      glossary: ownGlossaries[0].data.terms,
      chapterCount: own.length,
      url: novelUrl(n.slug),
      firstUrl: chapterUrl(n.slug, own[0].data.slug),
    };
  });
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export type Novel = Awaited<ReturnType<typeof getLibrary>>[number];
