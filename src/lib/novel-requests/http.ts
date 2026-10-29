/** HTTP transport for the isolated request handler. This is not a public route. */
import { handleNovelRequest, type HandlerDependencies } from './handler.ts';

const MAX_BODY_BYTES = 32 * 1024;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function json(status: number, body: object, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

function error(status: number, code: string, extra: Record<string, string> = {}): Response {
  return json(status, { error: code }, extra);
}

/**
 * No route is registered. The future deployment must provide an exact origin
 * allowlist and real server-side dependencies; empty configuration fails closed.
 * Cookies, forwarded IP headers and client roles are never used as identity.
 */
export async function handleRequestHttp(
  request: Request,
  config: { readonly allowedOrigins: readonly string[]; readonly dependencies: HandlerDependencies },
): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'method-not-allowed', { allow: 'POST' });
  if (!config.allowedOrigins.length || config.allowedOrigins.some(origin => {
    try { const parsed = new URL(origin); return parsed.protocol !== 'https:' || parsed.origin !== origin; } catch { return true; }
  })) return error(503, 'transport-not-configured');
  const origin = request.headers.get('origin');
  if (origin !== null && !config.allowedOrigins.includes(origin)) return error(403, 'origin-not-allowed');
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i)?.[1];
  if (!token) return error(401, 'unauthenticated');
  const contentType = request.headers.get('content-type');
  if (!contentType || !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(contentType))
    return error(415, 'unsupported-content-type');
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[\x21-\x7e]{8,128}$/.test(key)) return error(400, 'invalid-idempotency-key');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))))
    return error(400, 'invalid-content-length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return error(413, 'payload-too-large');

  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return error(413, 'payload-too-large');
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return error(400, 'invalid-body'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'invalid-body');
    if (Object.hasOwn(body, 'idempotencyKey')) return error(400, 'unexpected-field');
    const result = await handleNovelRequest({ token, body: { ...body, idempotencyKey: key } }, config.dependencies);
    const retry = 'retryAfterSeconds' in result.body ? result.body.retryAfterSeconds : undefined;
    const extra: Record<string, string> = result.status === 429 && Number.isSafeInteger(retry) && Number(retry) > 0
      ? { 'retry-after': String(retry) } : {};
    return json(result.status, result.body, extra);
  } catch {
    // Do not expose errors, source URLs, tokens or implementation details.
    return error(503, 'request-unavailable');
  }
}
