import type { APIRoute } from 'astro';
import { getLibrary, chapterUrl } from '../lib/content';
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify(
      (await getLibrary()).map(({ chapters, ...n }) => ({
        ...n,
        chapters: chapters.map((c) => ({ ...c.data, url: chapterUrl(n.slug, c.data.slug) })),
      })),
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
