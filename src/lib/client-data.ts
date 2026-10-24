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
