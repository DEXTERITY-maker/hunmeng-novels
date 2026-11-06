import type { APIRoute, GetStaticPaths } from 'astro';
import { getLibrary } from '../../../lib/content';

/**
 * Public text feed for the native Android reader.
 * Only locally published chapters from the validated library are exported.
 * Scheduled (unreleased) serial placeholders are intentionally excluded.
 */
export const getStaticPaths: GetStaticPaths = async () =>
  (await getLibrary()).flatMap(novel =>
    novel.chapters.map(chapter => ({
      params: { slug: novel.slug, chapter: chapter.data.slug },
      props: {
        novelSlug: novel.slug,
        chapterSlug: chapter.data.slug,
        number: chapter.data.number,
        title: chapter.data.title,
        body: chapter.body,
      },
    })),
  );

export const GET: APIRoute = ({ props }) =>
  new Response(
    JSON.stringify({
      novelSlug: props.novelSlug,
      slug: props.chapterSlug,
      number: props.number,
      title: props.title,
      format: 'markdown',
      content: props.body,
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
