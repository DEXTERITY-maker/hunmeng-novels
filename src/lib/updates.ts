import { chapterUrl, type Novel } from './content';

export function getLatestChapters(novels: Novel[]) {
  return novels
    .flatMap((novel) =>
      novel.chapters.map((chapter) => ({
        novel: novel.title,
        cover: novel.cover,
        title: chapter.data.title,
        number: chapter.data.number,
        date: chapter.data.publishedAt,
        url: chapterUrl(novel.slug, chapter.data.slug),
      })),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.number - a.number ||
        a.url.localeCompare(b.url),
    );
}
