import { getReleasedChapters } from './serial-release';
export interface ClientChapter {
  slug: string;
  title: string;
  number: number;
  url: string;
}
export interface ClientNovel {
  serial?: boolean;
  slug: string;
  title: string;
  originalTitle: string;
  author?: string;
  categories?: string[];
  views?: number | null;
  rating?: { average: number; count: number } | null;
  cover: string;
  description: string;
  genres: string[];
  tags: string[];
  translationStatus: string;
  originalStatus: string;
  updatedAt: string;
  chapterCount: number;
  url: string;
  firstUrl: string;
  chapters: ClientChapter[];
}
let data: Promise<ClientNovel[]> | undefined;
export function getCatalog() {
  return (data ??= fetch('/catalog.json').then((r) => {
    if (!r.ok) throw new Error('Unable to load the catalog');
    return r.json() as Promise<ClientNovel[]>;
  }).then(novels => Promise.all(novels.map(async novel => {
    if (!novel.serial) return novel;
    try {
      const chapters = await getReleasedChapters(novel.slug);
      const merged = new Map(novel.chapters.map(c => [c.number, c]));
      for (const chapter of chapters) merged.set(chapter.number, {
        slug: `chapter-${chapter.number}`, number: chapter.number, title: chapter.title,
        url: `/novel/${novel.slug}/chapter-${chapter.number}/`,
      });
      const all = [...merged.values()].sort((a, b) => a.number - b.number);
      return { ...novel, chapters: all, chapterCount: all.length };
    } catch { return novel; }
  }))));
}
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export interface CatalogIndexNovel {
  serial?: boolean;
  slug: string;
  title: string;
  originalTitle: string;
  author: string;
  cover: string;
  description: string;
  genres: string[];
  categories: string[];
  tags: string[];
  originalStatus: string;
  translationStatus: string;
  updatedAt: string;
  addedAt?: string;
  chapterCount: number;
  url: string;
  views: number | null;
  rating: { average: number; count: number } | null;
}
let indexData: Promise<CatalogIndexNovel[]> | undefined;
export function getCatalogIndex() {
  return (indexData ??= fetch('/catalog-index.json').then((response) => {
    if (!response.ok) throw new Error('Unable to load the search index');
    return response.json() as Promise<CatalogIndexNovel[]>;
  }).then(novels => Promise.all(novels.map(async novel => {
    if (!novel.serial) return novel;
    try { return { ...novel, chapterCount: Math.max(novel.chapterCount, (await getReleasedChapters(novel.slug)).length) }; }
    catch { return novel; }
  }))));
}
