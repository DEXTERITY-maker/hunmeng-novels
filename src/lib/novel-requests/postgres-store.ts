/** Server-only bridge to the unexposed SQL prototype. No database credentials. */
import type { NewRequest, RequestStore, StoredRequest, StoreResult } from './handler.ts';
import type { RequestStatus } from './core.ts';

type DbResult = { rows: Array<Record<string, unknown>> };
export type QueryExecutor = { query(text: string, values: unknown[]): Promise<DbResult> };
const statuses = new Set<RequestStatus>(['submitted', 'review', 'needs_rights', 'draft', 'converted', 'rejected']);

/**
 * Trusted server DB executor only. SQL grants and a least-privilege owner are
 * not yet production-ready. Fails closed on match/metadata until persisted.
 */
export function createPostgresRequestStore(db: QueryExecutor): RequestStore {
  return {
    async submitAtomically(input: NewRequest): Promise<StoreResult> {
      if (input.matches.length || Object.keys(input.adapterMetadata).length)
        throw new Error('Match and metadata persistence is not configured');
      const parsed = new URL(input.source.url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port)
        throw new Error('Invalid canonical source');
      const result = await db.query(
        'select private.request_store_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as result',
        [input.requesterId, input.requesterRef, input.source.provider, input.source.externalId,
          input.source.url, parsed.hostname, input.idempotencyKey, input.fingerprint,
          input.note, JSON.stringify(input.hints)],
      );
      const data = result.rows[0]?.result;
      if (!data || typeof data !== 'object') throw new Error('Invalid storage result');
      const entry = data as Record<string, unknown>;
      if (entry.kind === 'conflict') return { kind: 'conflict' };
      if (entry.kind === 'quota-exceeded') return { kind: 'quota-exceeded' };
      if (!['new', 'replay', 'active-request'].includes(String(entry.kind)) || typeof entry.request_id !== 'string')
        throw new Error('Invalid storage result');
      // Re-read the saved row, scoped to the verified requester. This matters
      // for an active duplicate submitted with a different note or hints.
      const read = await db.query(`
        select r.id, r.requester_ref, r.request_fingerprint, r.client_note, r.status,
               r.created_at, e.provider, e.external_id, e.canonical_url, h.payload
        from public.novel_requests r
        join public.request_external_sources e on e.id = r.external_source_id
        join public.request_client_hints h on h.request_id = r.id
        where r.id = $1 and r.requester_id = $2 and r.requester_ref = $3
      `, [entry.request_id, input.requesterId, input.requesterRef]);
      const row = read.rows[0];
      if (!row || !statuses.has(row.status as RequestStatus)) throw new Error('Saved request unavailable');
      const createdAt = new Date(String(row.created_at));
      if (!Number.isFinite(createdAt.getTime()) || typeof row.id !== 'string' ||
          typeof row.requester_ref !== 'string' || typeof row.request_fingerprint !== 'string' ||
          typeof row.client_note !== 'string' || typeof row.provider !== 'string' ||
          typeof row.external_id !== 'string' || typeof row.canonical_url !== 'string' ||
          !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload))
        throw new Error('Invalid saved request');
      const record: StoredRequest = {
        id: row.id, requesterRef: row.requester_ref, fingerprint: row.request_fingerprint,
        note: row.client_note, status: row.status as RequestStatus, createdAt: createdAt.toISOString(),
        source: { provider: row.provider, externalId: row.external_id, url: row.canonical_url },
        hints: row.payload, adapterMetadata: {}, matches: [],
      };
      return { kind: entry.kind as 'new' | 'replay' | 'active-request', record };
    },
  };
}
