import { getCollection } from 'astro:content';
import { originalStatusLabels, translationStatusLabels, termTypeLabels } from './labels';
export { chapterCount } from './format';
export const novelUrl = (slug: string) => `/novel/${slug}/`;
export const chapterUrl = (novel: string, chapter: string) => `/novel/${novel}/${chapter}/`;
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', {
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
    if (slugs.has(n.slug)) throw new Error(`Duplicate slug: ${n.slug}`);
    slugs.add(n.slug);
  }
  for (const { data: c } of chapters)
    if (!slugs.has(c.novelSlug)) throw new Error(`Chapter without a novel: ${c.novelSlug}`);
  for (const { data: g } of glossaries)
    if (!slugs.has(g.novelSlug)) throw new Error(`Glossary without a novel: ${g.novelSlug}`);
  const result = novels.map(({ data: n }) => {
    const own = chapters
      .filter((c) => c.data.novelSlug === n.slug)
      .sort((a, b) => a.data.number - b.data.number);
    if (!own.length) throw new Error(`No chapters: ${n.slug}`);
    const ids = new Set<string>(),
      numbers = new Set<number>();
    for (const c of own) {
      if (ids.has(c.data.slug) || numbers.has(c.data.number))
        throw new Error(`Duplicate chapter: ${n.slug}`);
      ids.add(c.data.slug);
      numbers.add(c.data.number);
    }
    const ownGlossaries = glossaries.filter((g) => g.data.novelSlug === n.slug);
    if (ownGlossaries.length !== 1)
      throw new Error(`Exactly one glossary is required: ${n.slug}`);
    const updatedAt = [n.updatedAt, ...own.map((c) => c.data.publishedAt)].sort().at(-1)!;
    return {
      ...n,
      originalStatus: originalStatusLabels[n.originalStatus],
      translationStatus: translationStatusLabels[n.translationStatus],
      updatedAt,
      chapters: own,
      glossary: ownGlossaries[0].data.terms.map(term => ({ ...term, type: termTypeLabels[term.type] })),
      chapterCount: own.length,
      url: novelUrl(n.slug),
      firstUrl: chapterUrl(n.slug, own[0].data.slug),
    };
  });
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export type Novel = Awaited<ReturnType<typeof getLibrary>>[number];
