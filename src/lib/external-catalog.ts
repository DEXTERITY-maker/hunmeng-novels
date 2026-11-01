import { externalNovels, externalNovelUrl } from '../data/external-novels';
import type { CatalogIndexNovel } from './client-data';

/**
 * Rights-safe discovery entries. Metadata only, never included in
 * getLibrary(), /catalog.json, published chapter lists, or reader rewards.
 * Exclude from the demo test fixture to preserve its existing two novels.
 */
export const visibleExternalNovels = process.env.HUNMENG_DEMO_CONTENT === '1' ? [] : externalNovels;

export const externalCatalogEntries: CatalogIndexNovel[] = visibleExternalNovels.map((source) => ({
  slug: source.slug,
  url: externalNovelUrl(source.slug),
  title: source.title,
  originalTitle: source.originalTitle,
  author: source.author,
  cover: '/images/novel-placeholder.svg',
  description: source.summary,
  original: false,
  external: true,
  externalId: source.externalId,
  sourceName: source.sourceName,
  sourceUrl: source.sourceUrl,
  genres: [...source.genres],
  categories: ['External reading'],
  tags: [...source.tags],
  originalStatus: source.status.startsWith('Ongoing') ? 'Ongoing' : source.status,
  translationStatus: 'External source',
  updatedAt: '2026-11-01',
  addedAt: '2026-11-01',
  chapterCount: 0,
  views: null,
  rating: null,
}));
