import type { APIRoute } from 'astro';
import { version } from '../../package.json';
// Only explicitly allow a commit SHA. Never serialize environment variables.
const sha = process.env.BUILD_COMMIT || process.env.GITHUB_SHA || '';
export const GET: APIRoute = () => new Response(JSON.stringify({
  version,
  commit: /^[0-9a-f]{40}$/.test(sha) ? sha : null,
}), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
