/**
 * Offline end-to-end prototype for a single novel request.
 *
 * It composes the pure building blocks from `core.ts` — adapter identification,
 * advisory matching, moderation transitions and the advisory rights gate — into
 * one local scenario:
 *
 *   URL -> recognized source -> advisory matches -> moderator decision -> draft
 *
 * The module is deliberately free of network access, persistence and
 * publication side effects. Every adapter, catalog and decision is supplied by
 * the caller; the shipped fixtures are fictional. A recognized URL never
 * proves rights, and a match never merges works.
 */
import {
  canPreparePublication,
  findMatches,
  identifySource,
  makeDecision,
  selectPermittedMetadata,
  type Chapter,
  type Decision,
  type Match,
  type MetadataField,
  type MetadataInput,
  type RequestStatus,
  type Rights,
  type SourceAdapter,
  type SourceIdentity,
  type WorkEvidence,
} from './core.ts';

/** A fictional catalog entry. `publishedSlug` mirrors a review link, not a merge. */
export type CatalogWork = WorkEvidence & { readonly publishedSlug: string | null };

export type RequestInput = {
  readonly requestId: string;
  readonly url: string;
  /** Fictional account identifier: this prototype performs no authentication. */
  readonly submittedBy: string;
  /** ISO timestamp supplied by the caller; no clock is read inside the module. */
  readonly submittedAt: string;
  /** Metadata already obtained by an explicit adapter. Never fetched here. */
  readonly metadata: MetadataInput;
};

export type MetadataPolicy = {
  readonly allowedFields: readonly MetadataField[];
  readonly evidence: string;
};

export type PrototypeConfig = {
  readonly adapters: readonly SourceAdapter[];
  readonly catalog: readonly CatalogWork[];
  readonly metadataPolicy: MetadataPolicy;
};

/** One audited moderator transition. Actor authorization is a server concern. */
export type ModerationStep = {
  readonly actorId: string;
  readonly to: RequestStatus;
  readonly reason: string;
  readonly at: string;
};

export type PrototypeNotes = readonly string[];

export type RejectedRequest = {
  readonly kind: 'rejected';
  readonly requestId: string;
  readonly sourceUrl: string;
  readonly reason: 'unsupported-or-invalid-url';
  readonly notes: PrototypeNotes;
};

export type RecognizedRequest = {
  readonly kind: 'recognized';
  readonly requestId: string;
  readonly sourceUrl: string;
  readonly source: SourceIdentity;
  readonly metadata: MetadataInput;
  readonly matches: readonly Match[];
  readonly decisions: readonly Decision[];
  readonly status: RequestStatus;
  readonly notes: PrototypeNotes;
  readonly networkUsed: false;
  readonly mergePerformed: false;
  readonly publicationAllowed: false;
};

/** A local draft only. It is never added to the static catalog or published. */
export type RequestDraft = {
  readonly kind: 'draft';
  readonly requestId: string;
  readonly sourceUrl: string;
  readonly source: SourceIdentity;
  readonly metadata: MetadataInput;
  readonly matches: readonly Match[];
  readonly decisions: readonly Decision[];
  readonly rights: Rights;
  readonly canPreparePublication: false;
  readonly publicationAllowed: false;
  readonly networkUsed: false;
  readonly mergePerformed: false;
  readonly notes: PrototypeNotes;
};

export type ScenarioResult =
  | { readonly kind: 'rejected'; readonly request: RejectedRequest; readonly draft: null }
  | { readonly kind: 'recognized'; readonly request: RecognizedRequest; readonly draft: null }
  | { readonly kind: 'draft'; readonly request: RecognizedRequest; readonly draft: RequestDraft };

const BASE_NOTES: PrototypeNotes = [
  'Prototype only: fictional catalog, fictional adapter, no network requests.',
  'A recognized source URL is not evidence of translation or publication rights.',
  'Advisory matches never merge works; every merge requires a human decision.',
];

/** Rights state for a newly prepared draft: always unverified. */
export const PENDING_RIGHTS: Rights = {
  status: 'pending',
  evidence: '',
  verifiedBy: null,
  validUntil: null,
  translate: false,
  publish: false,
};

export function describeMatches(matches: readonly Match[]): readonly string[] {
  return matches.map(match => {
    const reasons = match.reasons.length > 0 ? match.reasons.join('; ') : 'no reasons recorded';
    return `${match.kind}: ${match.workId} (${reasons})`;
  });
}

/**
 * Step 1-3: validate the URL, identify an explicitly supported source and
 * compare the request with a bounded, caller-supplied catalog.
 */
export function submitRequest(input: RequestInput, config: PrototypeConfig): RejectedRequest | RecognizedRequest {
  if (!input.requestId.trim()) throw new Error('requestId is required');
  if (!input.submittedBy.trim()) throw new Error('submittedBy is required');
  if (!Number.isFinite(Date.parse(input.submittedAt))) throw new Error('submittedAt must be an ISO timestamp');

  const source = identifySource(input.url, config.adapters);
  if (source === null) {
    return {
      kind: 'rejected',
      requestId: input.requestId,
      sourceUrl: input.url,
      reason: 'unsupported-or-invalid-url',
      notes: [...BASE_NOTES, 'Rejected before any matching: no adapter recognized this URL.'],
    };
  }

  const metadata = selectPermittedMetadata(input.metadata, {
    allowedFields: config.metadataPolicy.allowedFields,
    evidence: config.metadataPolicy.evidence,
  });
  const evidence: WorkEvidence = {
    id: input.requestId,
    titles: [metadata.originalTitle ?? '', ...(metadata.alternativeTitles ?? [])].filter(Boolean),
    authors: metadata.authors ?? [],
    sources: [source],
    chapters: [...(metadata.chapterTitles ?? [])],
  };
  const matches = findMatches(evidence, config.catalog);

  return {
    kind: 'recognized',
    requestId: input.requestId,
    sourceUrl: source.url,
    source,
    metadata,
    matches,
    decisions: [],
    status: 'submitted',
    notes: [...BASE_NOTES],
    networkUsed: false,
    mergePerformed: false,
    publicationAllowed: false,
  };
}

/**
 * Step 4: apply an audited decision trail. An invalid transition, a missing
 * moderator or an empty reason throws before any draft exists.
 */
export function moderate(request: RecognizedRequest, steps: readonly ModerationStep[]): RecognizedRequest {
  if (steps.length === 0) throw new Error('At least one moderation step is required');
  let status: RequestStatus = request.status;
  const decisions: Decision[] = [];
  for (const step of steps) {
    const decision = makeDecision(status, step.to, step.actorId, step.reason, step.at);
    decisions.push(decision);
    status = decision.to;
  }
  return { ...request, status, decisions: [...request.decisions, ...decisions] };
}

/**
 * Step 5: prepare a local draft. Rights stay unverified by construction, so the
 * advisory publication gate always fails and nothing is marked published.
 */
export function buildDraft(request: RecognizedRequest, today: string): RequestDraft {
  if (request.status !== 'draft') throw new Error('Only a request in the draft state can produce a draft');
  if (PENDING_RIGHTS.status !== 'pending') throw new Error('Prototype rights state must stay unverified');
  const canPublish = canPreparePublication(PENDING_RIGHTS, today);
  if (canPublish) throw new Error('Prototype draft must never pass the advisory rights gate');
  return {
    kind: 'draft',
    requestId: request.requestId,
    sourceUrl: request.sourceUrl,
    source: request.source,
    metadata: request.metadata,
    matches: request.matches,
    decisions: request.decisions,
    rights: { ...PENDING_RIGHTS },
    canPreparePublication: false,
    publicationAllowed: false,
    networkUsed: false,
    mergePerformed: false,
    notes: [
      ...request.notes,
      'Draft is local only: not added to the catalog, not published, rights unverified.',
    ],
  };
}

/**
 * Full local scenario. The draft appears only after the moderator trail reaches
 * the `draft` state; otherwise the recognized request is returned as-is.
 */
export function runPrototypeScenario(
  input: RequestInput,
  config: PrototypeConfig,
  steps: readonly ModerationStep[],
  today: string,
): ScenarioResult {
  const first = submitRequest(input, config);
  if (first.kind === 'rejected') return { kind: 'rejected', request: first, draft: null };
  const moderated = moderate(first, steps);
  if (moderated.status === 'draft') return { kind: 'draft', request: moderated, draft: buildDraft(moderated, today) };
  return { kind: 'recognized', request: moderated, draft: null };
}
