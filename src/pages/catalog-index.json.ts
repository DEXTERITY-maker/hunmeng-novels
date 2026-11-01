import type { APIRoute } from 'astro';
import { getLibrary } from '../lib/content';
import serials from '../data/serials';
import { unpublishedExternalEntries } from '../lib/external-catalog';

// Lightweight search index excludes chapter lists and full text.
export const GET: APIRoute = async () => {
  const published = await getLibrary();
  return new Response(
    JSON.stringify(
      [...published.map((n) => ({
        slug: n.slug,
        serial: serials.some(s => s.slug === n.slug),
        original: n.original,
        art: n.art,
        title: n.title,
        originalTitle: n.originalTitle,
        author: n.author,
        cover: n.cover,
        description: n.description,
        genres: n.genres,
        categories: n.categories,
        tags: n.tags,
        originalStatus: n.originalStatus,
        translationStatus: n.translationStatus,
        updatedAt: n.updatedAt,
        addedAt: n.addedAt,
        chapterCount: n.chapterCount,
        url: n.url,
        views: n.views ?? null,
        rating: n.rating ?? null,
      })), ...unpublishedExternalEntries(published.map(n => n.slug))],
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
