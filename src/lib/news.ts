import { getCollection } from 'astro:content';

export const newsCategories = {
  changelog: 'Обновления',
  announcements: 'Объявления',
  giveaways: 'Розыгрыши',
} as const;

export type NewsCategory = keyof typeof newsCategories;
export type NewsPost = Awaited<ReturnType<typeof getNews>>[number];
export const newsUrl = (slug: string) => `/news/${slug}/`;

export async function getNews() {
  const posts = await getCollection('news');
  return posts.sort((a, b) =>
    b.data.publishedAt.localeCompare(a.data.publishedAt) ||
    b.data.order - a.data.order ||
    a.id.localeCompare(b.id),
  );
}
