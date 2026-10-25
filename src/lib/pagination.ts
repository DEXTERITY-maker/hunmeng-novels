export const CHAPTERS_PER_PAGE = 100;
export function chapterListUrl(slug: string, page: number) {
  return `/novel/${slug}/chapters/${page}/`;
}
export function chapterPageCount(count: number) {
  return Math.max(1, Math.ceil(count / CHAPTERS_PER_PAGE));
}
