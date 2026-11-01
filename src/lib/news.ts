import { getCollection } from 'astro:content';

export const newsCategories = {
  changelog: 'Changelog',
  announcements: 'Announcements',
  giveaways: 'Giveaways',
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

const categoryArt: Record<NewsCategory, string> = {
  changelog: '/images/profile/header-day-960.webp',
  announcements: '/images/art/hunmeng-landscape-day-960.webp',
  giveaways: '/images/events/halloween-2026/gold.webp',
};
/** Illustration for a post: its own cover, the cover of a novel it names, or category art. */
export function newsCover(post: NewsPost, library: Array<{ title: string; cover: string }> = []) {
  const { cover, coverAlt, coverFit, title, category } = post.data;
  if (cover) return { src: cover, alt: coverAlt ?? '', fit: coverFit };
  const novel = library.find((n) => title.toLowerCase().includes(n.title.toLowerCase()));
  if (novel) return { src: novel.cover, alt: '', fit: 'novel' as const };
  return { src: categoryArt[category], alt: '', fit: category === 'giveaways' ? 'emblem' as const : 'art' as const };
}
