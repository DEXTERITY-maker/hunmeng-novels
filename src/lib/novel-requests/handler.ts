/**
 * Isolated novel-request submission handler.
 *
 * This module contains the server-side orchestration only: identity check,
 * input validation, explicit source recognition, rate limiting and an atomic
 * persistence contract. It has NO public route, NO adapter that touches the
 * network, NO Supabase client and NO publication code. Every dependency is
 * injected; a missing identity check, rate limiter, source registry, catalog or
 * store makes the handler fail closed.
 *
 * The shipped module contains no test doubles. Test implementations live in
 * `tests/novel-request-handler.test.mjs` and are not a production security
 * boundary.
 */
import {
  findMatches,
  identifySource,
  type Chapter,
  type Match,
  type SourceAdapter,
  type SourceIdentity,
  type WorkEvidence,
} from './core.ts';

export type ActorRole = 'user' | 'editor' | 'admin';

/** Result of a verified identity. Authorization roles are never taken from the request body. */
export type AuthenticatedActor = {
  readonly userId: string;
  readonly role: ActorRole;
  readonly active: boolean;
};

export type IdentityVerifier = {
  verify(token: string | null): Promise<AuthenticatedActor | null>;
};

/** Metadata obtained by an explicit source adapter. Separate from user hints. */
export type AdapterMetadata = {
  readonly originalTitle?: string;
  readonly alternativeTitles?: readonly string[];
  readonly authors?: readonly string[];
  readonly chapterTitles?: readonly Chapter[];
};

export type AdapterRecognition = {
  readonly source: SourceIdentity;
  readonly metadata: AdapterMetadata;
  readonly provenance: {
    readonly provider: string;
    readonly adapterVersion: string;
    readonly policyId: string;
  };
};

/**
 * Recognizes a URL through an explicit adapter. Implementations may be async,
 * but no adapter may fetch URLs on behalf of the handler in this phase.
 * `null` means "this URL is not supported"; a thrown error means the registry
 * itself is unavailable.
 */
export type SourceRegistry = {
  recognize(url: string): Promise<AdapterRecognition | null>;
};

/** Read-only catalog used for advisory matching only. */
export type CatalogReader = {
  works(): Promise<readonly WorkEvidence[]>;
};

export type RateLimitDecision = { readonly allowed: boolean; readonly retryAfterSeconds?: number };

export type RateLimiter = {
  check(bucketKey: string): Promise<RateLimitDecision>;
};

/** Untrusted user-provided hints. Stored for moderators, never used as identity. */
export type ClientHints = {
  readonly originalTitle?: string;
  readonly alternativeTitles?: readonly string[];
  readonly authors?: readonly string[];
  readonly chapterTitles?: readonly Chapter[];
};

export type StoredRequest = {
  readonly id: string;
  readonly requesterRef: string;
  readonly source: SourceIdentity;
  readonly fingerprint: string;
  readonly note: string;
  readonly hints: ClientHints;
  readonly adapterMetadata: AdapterMetadata;
  readonly matches: readonly Match[];
  readonly status: 'submitted';
  readonly createdAt: string;
};

export type NewRequest = Omit<StoredRequest, 'id' | 'createdAt'> & {
  /** Kept by the store for the (requesterRef, idempotencyKey) uniqueness contract. */
  readonly idempotencyKey: string;
};

/**
 * Persistence contract. A real implementation must insert the request and its
 * idempotency/source uniqueness checks in ONE database transaction; the in-memory
 * double used by tests cannot prove that.
 */
export type StoreResult =
  | { readonly kind: 'new' | 'replay' | 'active-request'; readonly record: StoredRequest }
  | { readonly kind: 'conflict'; readonly existingRequestId: string }
  | { readonly kind: 'quota-exceeded'; readonly retryAfterSeconds?: number };
/** A single transaction must check idempotency and active source, consume the
 * creation quota only for a new row, and persist it. HTTP throttling is separate. */
export type RequestStore = {
  submitAtomically(record: NewRequest): Promise<StoreResult>;
};

export type HandlerDependencies = {
  readonly identity: IdentityVerifier | null;
  readonly sources: SourceRegistry | null;
  /** Independently configured, trusted URL rules, never derived from registry output. */
  readonly allowedAdapters: readonly SourceAdapter[] | null;
  readonly catalog: CatalogReader | null;
  readonly rateLimiter: RateLimiter | null;
  readonly store: RequestStore | null;
  readonly algorithmVersion?: string;
};

export type SubmitInput = {
  readonly token: string | null | undefined;
  /** Raw request body. Everything here is untrusted. */
  readonly body: unknown;
  /** Hashed client IP prepared by the transport layer; never raw and never from the body. */
  readonly clientIpHash?: string | null;
};

export type ErrorCode =
  | 'dependency-unavailable'
  | 'unauthenticated'
  | 'inactive-account'
  | 'invalid-body'
  | 'unexpected-field'
  | 'unsupported-url'
  | 'payload-too-large'
  | 'rate-limited'
  | 'idempotency-key-reused'
  | 'storage-unavailable';

export type HandlerErrorBody = {
  error: ErrorCode;
  message: string;
  field?: string;
  retryAfterSeconds?: number;
  existingRequestId?: string;
};

export type HandlerErrorStatus = 400 | 401 | 403 | 409 | 429 | 503;

export type HandlerError = {
  readonly status: HandlerErrorStatus;
  readonly body: HandlerErrorBody;
};

export type SubmitResponse = {
  readonly requestId: string;
  readonly status: 'submitted';
  readonly deduplicated: 'new' | 'replay' | 'active-request';
  readonly matches: readonly Match[];
  readonly rights: 'unverified';
  readonly algorithmVersion: string;
  readonly provisional: true;
};

export type HandlerSuccess = {
  readonly status: 200 | 201;
  readonly body: SubmitResponse;
};

export type HandlerResult = HandlerSuccess | HandlerError;

const DEFAULT_ALGORITHM_VERSION = 'requests-match-v1';
const MAX_URL_LENGTH = 2048;
const MAX_NOTE_LENGTH = 2000;
const MIN_IDEMPOTENCY_LENGTH = 8;
const MAX_IDEMPOTENCY_LENGTH = 128;
const MAX_HINTS_JSON_LENGTH = 20000;
const BODY_FIELDS = new Set(['url', 'note', 'idempotencyKey', 'clientHints']);
const HINT_FIELDS = new Set(['originalTitle', 'alternativeTitles', 'authors', 'chapterTitles']);

const fail = (
  status: HandlerErrorStatus,
  error: ErrorCode,
  message: string,
  extra: { field?: string; retryAfterSeconds?: number; existingRequestId?: string } = {},
): HandlerError => {
  const body: HandlerErrorBody = { error, message };
  if (extra.field !== undefined) body.field = extra.field;
  if (extra.retryAfterSeconds !== undefined) body.retryAfterSeconds = extra.retryAfterSeconds;
  if (extra.existingRequestId !== undefined) body.existingRequestId = extra.existingRequestId;
  return { status, body };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Canonical, deterministic serialization used for the server-side fingerprint. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

/** Pseudonymous requester reference; the raw user id never leaves the identity layer. */
export async function requesterReference(userId: string): Promise<string> {
  return sha256(`requester:${userId}`);
}

function normalizeText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw fail(400, 'invalid-body', `${field} must not be empty`, { field });
  return trimmed;
}

function validateHints(raw: unknown): ClientHints {
  if (!isRecord(raw)) throw fail(400, 'invalid-body', 'clientHints must be an object', { field: 'clientHints' });
  for (const key of Object.keys(raw)) {
    if (!HINT_FIELDS.has(key)) throw fail(400, 'unexpected-field', 'Unknown clientHints field');
  }
  const hints: {
    originalTitle?: string;
    alternativeTitles?: string[];
    authors?: string[];
    chapterTitles?: Chapter[];
  } = {};
  if (raw.originalTitle !== undefined) {
    if (typeof raw.originalTitle !== 'string') throw fail(400, 'invalid-body', 'clientHints.originalTitle must be a string', { field: 'clientHints.originalTitle' });
    const title = raw.originalTitle.trim().slice(0, 250);
    if (title) hints.originalTitle = title;
  }
  const stringList = (key: 'alternativeTitles' | 'authors', value: unknown): string[] => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || value.length > 50)
      throw fail(400, 'invalid-body', `clientHints.${key} must be an array of up to 50 strings`, { field: `clientHints.${key}` });
    return value.map(item => (item as string).trim().slice(0, 250)).filter(Boolean);
  };
  if (raw.alternativeTitles !== undefined) hints.alternativeTitles = stringList('alternativeTitles', raw.alternativeTitles);
  if (raw.authors !== undefined) hints.authors = stringList('authors', raw.authors);
  if (raw.chapterTitles !== undefined) {
    const value = raw.chapterTitles;
    if (!Array.isArray(value) || value.length > 10000)
      throw fail(400, 'invalid-body', 'clientHints.chapterTitles must be an array', { field: 'clientHints.chapterTitles' });
    hints.chapterTitles = value.map((item, index) => {
      if (!isRecord(item) || !Number.isSafeInteger(item.number) || (item.number as number) < 1 || typeof item.title !== 'string')
        throw fail(400, 'invalid-body', 'clientHints.chapterTitles entries must be {number, title}', { field: `clientHints.chapterTitles[${index}]` });
      return { number: item.number as number, title: item.title.trim().slice(0, 250) };
    });
  }
  return hints;
}

type ValidatedBody = {
  readonly url: string;
  readonly note: string;
  readonly idempotencyKey: string;
  readonly hints: ClientHints;
};

function validateBody(raw: unknown): ValidatedBody {
  if (!isRecord(raw)) throw fail(400, 'invalid-body', 'request body must be a JSON object');
  for (const key of Object.keys(raw)) {
    if (!BODY_FIELDS.has(key))
      throw fail(400, 'unexpected-field', 'Unknown request field');
  }
  if (typeof raw.url !== 'string' || raw.url.length > MAX_URL_LENGTH)
    throw fail(400, 'invalid-body', 'url must be a string of at most 2048 characters', { field: 'url' });
  const note = raw.note === undefined ? '' : raw.note;
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)
    throw fail(400, 'invalid-body', `note must be a string of at most ${MAX_NOTE_LENGTH} characters`, { field: 'note' });
  if (typeof raw.idempotencyKey !== 'string' || raw.idempotencyKey.length < MIN_IDEMPOTENCY_LENGTH || raw.idempotencyKey.length > MAX_IDEMPOTENCY_LENGTH)
    throw fail(400, 'invalid-body', 'idempotencyKey must be a string of 8..128 characters', { field: 'idempotencyKey' });
  if (JSON.stringify(raw).length > MAX_HINTS_JSON_LENGTH)
    throw fail(400, 'payload-too-large', 'request body is too large');
  const hints = raw.clientHints === undefined ? {} : validateHints(raw.clientHints);
  return { url: raw.url.trim(), note: note.trim(), idempotencyKey: raw.idempotencyKey, hints };
}

function toMatchView(matches: readonly Match[]): readonly Match[] {
  return matches.map(match => ({ workId: match.workId, kind: match.kind, reasons: [...match.reasons] }));
}

function responseFor(record: StoredRequest, deduplicated: SubmitResponse['deduplicated'], algorithmVersion: string): HandlerSuccess {
  return {
    status: deduplicated === 'new' ? 201 : 200,
    body: {
      requestId: record.id,
      status: 'submitted',
      deduplicated,
      matches: toMatchView(record.matches),
      rights: 'unverified',
      algorithmVersion,
      provisional: true,
    },
  };
}

/**
 * Submit a novel request. Fails closed on any missing dependency.
 * Deliberately not connected to an HTTP route in this repository.
 */
export async function handleNovelRequest(input: SubmitInput, dependencies: HandlerDependencies): Promise<HandlerResult> {
  const algorithmVersion = dependencies.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION;

  if (!dependencies.identity || !dependencies.sources || !dependencies.allowedAdapters || !dependencies.catalog || !dependencies.rateLimiter || !dependencies.store)
    return fail(503, 'dependency-unavailable', 'Request intake is not configured.');

  let body: ValidatedBody;
  try {
    body = validateBody(input.body);
  } catch (error) {
    return error as HandlerError;
  }

  // 1. Identity: a missing or failed verifier fails closed; null means "no session".
  let actor: AuthenticatedActor | null;
  try {
    actor = await dependencies.identity.verify(input.token ?? null);
  } catch {
    return fail(503, 'dependency-unavailable', 'Identity verification is unavailable.');
  }
  if (!actor) return fail(401, 'unauthenticated', 'Sign in to submit a request.');
  if (!actor.active) return fail(403, 'inactive-account', 'This account cannot submit requests.');
  const requesterRef = await requesterReference(actor.userId);

  // 2. Rate limiting: user bucket and, when provided by the transport, IP bucket.
  try {
    const userLimit = await dependencies.rateLimiter.check(`submit:user:${requesterRef}`);
    if (!userLimit.allowed)
      return fail(429, 'rate-limited', 'Too many submissions. Try again later.', {
        ...(userLimit.retryAfterSeconds ? { retryAfterSeconds: userLimit.retryAfterSeconds } : {}),
      });
    if (input.clientIpHash) {
      const ipLimit = await dependencies.rateLimiter.check(`submit:ip:${input.clientIpHash}`);
      if (!ipLimit.allowed)
        return fail(429, 'rate-limited', 'Too many submissions. Try again later.', {
          ...(ipLimit.retryAfterSeconds ? { retryAfterSeconds: ipLimit.retryAfterSeconds } : {}),
        });
    }
  } catch {
    return fail(503, 'dependency-unavailable', 'Rate limiting is unavailable.');
  }

  // 3. Both input and canonical output must match independently configured rules.
  let recognition: AdapterRecognition | null;
  try {
    const expected = identifySource(body.url, dependencies.allowedAdapters);
    if (!expected) return fail(400, 'unsupported-url', 'This URL is not supported.', { field: 'url' });
    recognition = await dependencies.sources.recognize(body.url);
    if (!recognition) return fail(400, 'unsupported-url', 'This URL is not supported.', { field: 'url' });
    const canonical = identifySource(recognition.source.url, dependencies.allowedAdapters);
    if (!canonical || canonical.provider !== expected.provider || canonical.externalId !== expected.externalId ||
        recognition.source.provider !== expected.provider || recognition.source.externalId !== expected.externalId ||
        canonical.url !== recognition.source.url || recognition.provenance.provider !== expected.provider)
      return fail(400, 'unsupported-url', 'This URL is not supported.', { field: 'url' });
  } catch {
    return fail(503, 'dependency-unavailable', 'Source recognition is unavailable.');
  }

  // 4. Server-side fingerprint: canonical URL + validated hints + note.
  const fingerprint = await sha256(
    canonicalJson({
      url: recognition.source.url,
      provider: recognition.source.provider,
      externalId: recognition.source.externalId,
      note: body.note,
      hints: body.hints,
    }),
  );

  // 6. Advisory matching uses adapter metadata only; client hints are never match input.
  let matches: readonly Match[];
  try {
    const catalog = await dependencies.catalog.works();
    const metadata = recognition.metadata;
    const evidence: WorkEvidence = {
      id: 'pending-request',
      titles: [metadata.originalTitle ?? '', ...(metadata.alternativeTitles ?? [])].filter(Boolean),
      authors: [...(metadata.authors ?? [])],
      sources: [recognition.source],
      chapters: [...(metadata.chapterTitles ?? [])],
    };
    matches = findMatches(evidence, catalog);
  } catch {
    return fail(503, 'dependency-unavailable', 'Matching catalog is unavailable.');
  }

  // 7. Store enforces replay, conflict, source uniqueness and creation quota atomically.
  try {
    const result = await dependencies.store.submitAtomically({
      requesterRef, idempotencyKey: body.idempotencyKey, source: recognition.source,
      fingerprint, note: body.note, hints: body.hints, adapterMetadata: recognition.metadata,
      matches, status: 'submitted',
    });
    if (result.kind === 'conflict') return fail(409, 'idempotency-key-reused', 'This idempotency key was already used with different content.');
    if (result.kind === 'quota-exceeded') return fail(429, 'rate-limited', 'Too many submissions. Try again later.', { retryAfterSeconds: result.retryAfterSeconds });
    return responseFor(result.record, result.kind, algorithmVersion);
  } catch {
    return fail(503, 'storage-unavailable', 'Request storage is unavailable.');
  }
}
