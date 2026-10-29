/** Disconnected server orchestration; no public route or production access. */
import type { IdentityVerifier, RequesterReferenceDeriver, RateLimiter } from './handler.ts';
import type { QueryExecutor } from './postgres-store.ts';

type Dependencies = {
  identity: IdentityVerifier | null;
  actorReferences: RequesterReferenceDeriver | null;
  limiter: RateLimiter | null;
  database: QueryExecutor | null;
};
type Response = { status: number; body: Record<string, unknown> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reference = /^[0-9a-f]{64}$/;
const queueSql = 'select * from private.request_moderation_queue($1,$2,$3,$4)';
const decisionSql = 'select private.request_moderate($1,$2,$3,$4,$5,$6) as result';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const error = (status: number, code: string): Response => ({ status, body: { error: code } });

async function authorize(token: string | null, dependencies: Dependencies) {
  const { identity, actorReferences, limiter, database } = dependencies;
  if (!identity || !actorReferences || !limiter || !database) return { failure: error(503, 'dependency-unavailable') };
  if (!token) return { failure: error(401, 'authentication-required') };
  try {
    const actor = await identity.verify(token);
    if (!actor) return { failure: error(401, 'authentication-required') };
    if (!actor.active) return { failure: error(403, 'account-inactive') };
    if (!uuid.test(actor.userId)) throw new Error('invalid identity');
    const actorRef = await actorReferences.derive(actor.userId);
    if (!reference.test(actorRef)) throw new Error('invalid actor reference');
    const limit = await limiter.check(`moderation:${actorRef}`);
    if (!limit.allowed) return { failure: error(429, 'rate-limited') };
    // The actor's role is resolved independently by the database function.
    return { actorId: actor.userId, actorRef, database };
  } catch { return { failure: error(503, 'dependency-unavailable') }; }
}

function databaseFailure(cause: unknown): Response {
  return object(cause) && cause.code === '42501'
    ? error(403, 'not-authorized') : error(503, 'dependency-unavailable');
}

/** A cursor preserves the exact timestamp text returned by PostgreSQL. */
export async function listModerationQueue(token: string | null, input: unknown, deps: Dependencies): Promise<Response> {
  const auth = await authorize(token, deps);
  if (auth.failure) return auth.failure;
  if (!object(input) || Object.keys(input).some(k => !['limit', 'after'].includes(k))) return error(400, 'invalid-input');
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50) return error(400, 'invalid-input');
  let afterTime: string | null = null, afterId: string | null = null;
  if (input.after != null) {
    if (!object(input.after) || Object.keys(input.after).sort().join(',') !== 'createdAt,id' ||
        typeof input.after.createdAt !== 'string' || input.after.createdAt.length > 50 ||
        !/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(input.after.createdAt) ||
        !Number.isFinite(Date.parse(input.after.createdAt)) || typeof input.after.id !== 'string' || !uuid.test(input.after.id))
      return error(400, 'invalid-input');
    afterTime = input.after.createdAt; afterId = input.after.id;
  }
  try {
    const result = await auth.database.query(queueSql, [auth.actorId, afterTime, afterId, limit]);
    if (result.rows.length > Number(limit)) throw new Error('invalid queue');
    const items = result.rows.map(row => {
      if (typeof row.id !== 'string' || !uuid.test(row.id) ||
          !['submitted', 'review', 'needs_rights', 'draft'].includes(String(row.status)) ||
          !Number.isInteger(row.version) || typeof row.created_at !== 'string' ||
          typeof row.submitted_url !== 'string' || typeof row.client_note !== 'string' ||
          !object(row.hints) || !object(row.metadata) || !Array.isArray(row.matches)) throw new Error('invalid queue');
      return { id: row.id, status: row.status, version: row.version, createdAt: row.created_at,
        submittedUrl: row.submitted_url, note: row.client_note, hints: row.hints,
        metadata: row.metadata, matches: row.matches };
    });
    return { status: 200, body: { items } };
  } catch (cause) { return databaseFailure(cause); }
}

/** Only status-only transitions; draft/conversion are intentionally unavailable. */
export async function submitModerationDecision(token: string | null, input: unknown, deps: Dependencies): Promise<Response> {
  const auth = await authorize(token, deps);
  if (auth.failure) return auth.failure;
  if (!object(input) || Object.keys(input).sort().join(',') !== 'expectedVersion,reason,requestId,to' ||
      typeof input.requestId !== 'string' || !uuid.test(input.requestId) ||
      !Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || Number(input.expectedVersion) >= 2147483647 ||
      typeof input.to !== 'string' || !['review', 'needs_rights', 'rejected'].includes(input.to) ||
      typeof input.reason !== 'string' || input.reason.trim().length < 1 || input.reason.trim().length > 2000)
    return error(400, 'invalid-input');
  try {
    const result = await auth.database.query(decisionSql,
      [auth.actorId, auth.actorRef, input.requestId, input.expectedVersion, input.to, input.reason.trim()]);
    const decision = result.rows[0]?.result;
    if (!object(decision)) throw new Error('invalid result');
    if (decision.kind === 'not-found') return error(404, 'not-found');
    if (decision.kind === 'conflict' && Number.isInteger(decision.version) && Number(decision.version) >= 1)
      return { status: 409, body: { error: 'version-conflict', version: decision.version } };
    if (decision.kind !== 'updated' || decision.status !== input.to || decision.version !== Number(input.expectedVersion) + 1)
      throw new Error('invalid result');
    return { status: 200, body: { status: decision.status, version: decision.version } };
  } catch (cause) { return databaseFailure(cause); }
}
