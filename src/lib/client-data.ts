export interface ClientChapter {
  slug: string;
  title: string;
  number: number;
  url: string;
}
export interface ClientNovel {
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
    if (!r.ok) throw new Error('Не удалось загрузить каталог');
    return r.json() as Promise<ClientNovel[]>;
  }));
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
    if (!response.ok) throw new Error('Не удалось загрузить поисковый индекс');
    return response.json() as Promise<CatalogIndexNovel[]>;
  }));
}
