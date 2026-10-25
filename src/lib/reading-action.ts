import type { ClientNovel } from './client-data';
import type { Progress } from './storage';

// The reader rounds the progress indicator to a whole percent. Only a displayed
// 100% advances to another chapter; 98–99% still resumes the saved position.
export function readingAction(novel: ClientNovel, progress?: Progress) {
  const index = novel.chapters.findIndex((chapter) => chapter.slug === progress?.chapterSlug);
  const current = novel.chapters[index];
  if (!current || !progress) {
    return {
      kind: 'start' as const,
      url: novel.firstUrl,
      label: 'Начать читать',
      chapter: novel.chapters[0],
      ratio: 0,
    };
  }
  if (progress.ratio >= 0.995) {
    const next = novel.chapters[index + 1];
    if (next)
      return {
        kind: 'next' as const,
        url: next.url,
        label: 'Следующая глава',
        chapter: next,
        ratio: 0,
      };
    // "Caught up" means all published chapters, not a completed translation.
    return {
      kind: 'caught-up' as const,
      url: novel.firstUrl,
      label: 'Читать сначала',
      chapter: current,
      ratio: 1,
    };
  }
  return {
    kind: 'resume' as const,
    url: current.url + '?resume=1',
    label: 'Продолжить',
    chapter: current,
    ratio: progress.ratio,
  };
}
