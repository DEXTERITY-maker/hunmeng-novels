import type { APIRoute } from 'astro';
import { getLibrary, chapterUrl } from '../lib/content';
import serials from '../data/serials';
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify(
      (await getLibrary()).map(({ chapters, ...n }) => ({
        ...n,
        serial: serials.some(s => s.slug === n.slug),
        chapters: chapters.map((c) => ({ ...c.data, url: chapterUrl(n.slug, c.data.slug) })),
      })),
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
