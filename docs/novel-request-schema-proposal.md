# Novel request storage and server contract (proposal, not applied)

Status: **design proposal for review.** No table is created, no RLS policy or grant is changed, no migration is applied, and nothing in this document is deployed. It is written for PR #62 (`feat/novel-request-foundation-20261028`) on top of the local prototype from commit `c43c9e10f48797b1f4163e744c5cdf27821f0961` and the existing schema in `backend/*.sql`.

Related documents: `docs/novel-request-foundation.md` (scope and local prototype), `backend/schema.sql` (existing sources, jobs, guards), `backend/editorial-safety-20261027.sql`.

## 1. Goals and non-goals

Goals:

- store a user request and its requester, the recognized external source, candidate matches with explanations, an append-only moderation history, and a draft whose rights are **not** verified;
- reuse `public.novel_sources`, the existing rights/QA guards and the existing publication pipeline instead of duplicating them;
- make resubmission idempotent, concurrent submissions and concurrent moderator actions safe, and probable matches strictly advisory;
- keep requester, editor and administrator access separate, and keep private rights evidence out of requester reach.

Non-goals (explicitly out of scope here): running a real source adapter, fetching any URL, importing chapters or covers, generating AI images, editing `reader_chapter_registry` or `reader_xp_events`, changing the XP formula, touching production, DNS, Cloudflare, Discord or the site itself.

## 2. Existing structures this proposal reuses

| Existing structure | How it is reused |
| --- | --- |
| `public.novel_sources` (`id`, `slug` unique, `rights_status`, `permission_*`, `verified_by`, `verified_at`, `rights_evidence`, `rights_valid_until`) | Canonical editorial source. A converted request points at it through `converted_source_id`; nothing is copied into the request tables. Published slug = `novel_sources.slug` (same value as `src/content/novels/<slug>.json`). |
| `public.novel_translation_jobs` + `novel_guard_job()` | Chapters still enter through the existing draft → review → approved → published flow with its QA and rights checks. |
| `backend/editorial-safety-20261027.sql` policies | Editors see their own chapters; admins see all. The request tables follow the same role source. |
| `public.novel_staff` (`user_id`, `role in ('admin','editor')`) | The only source of editorial role. `user_metadata` is never used for authorization. |
| `scripts/publish-approved.mjs` + `.github/workflows/publish-approved.yml` | Publication stays a separate service-role job that re-checks rights and QA immediately before pushing. |
| `reader_chapter_registry`, `reader_xp_events` | Untouched and unlinked from request tables. Reader progress never references a request. |

## 3. Proposed tables

All names are prefixed with `request_` to keep them visibly separate from the editorial tables. DDL below is a **proposal**, not a migration. In production it would live in a reviewed migration file and be applied only after owner approval.

```sql
-- PROPOSAL ONLY. Do not apply.

create table public.request_works (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null check (length(trim(canonical_title)) between 1 and 250),
  canonical_author text not null default '' check (length(canonical_author) <= 250),
  normalized_title text not null check (length(normalized_title) between 1 and 250),
  normalized_author text not null default '',
  state text not null default 'proposed' check (state in ('proposed','confirmed','converted','rejected')),
  novel_source_id uuid references public.novel_sources(id),  -- set on conversion, never duplicated
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index request_works_novel_source on public.request_works(novel_source_id);
create index request_works_state on public.request_works(state);

create table public.request_work_titles (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.request_works(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 250),
  language text not null default 'und' check (language ~ '^[a-z]{2,3}$' or language = 'und'),
  normalized_title text not null,
  kind text not null default 'alias' check (kind in ('original','alias','translated')),
  created_at timestamptz not null default now(),
  unique (work_id, normalized_title)
);

create table public.request_work_authors (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.request_works(id) on delete cascade,
  author_name text not null check (length(trim(author_name)) between 1 and 250),
  normalized_author text not null,
  created_at timestamptz not null default now(),
  unique (work_id, normalized_author)
);

create table public.request_external_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  external_id text not null check (length(external_id) between 1 and 128),
  canonical_url text not null check (canonical_url ~ '^https://' and length(canonical_url) <= 2048),
  host text not null check (length(host) <= 253),
  work_id uuid references public.request_works(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index request_external_sources_work on public.request_external_sources(work_id);

create table public.novel_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  submitted_url text not null check (submitted_url ~ '^https://' and length(submitted_url) <= 2048),
  external_source_id uuid not null references public.request_external_sources(id),
  work_id uuid references public.request_works(id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted','review','needs_rights','draft','converted','rejected')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  client_note text not null default '' check (length(client_note) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, idempotency_key)
);
create unique index novel_requests_active_source
  on public.novel_requests (requester_id, external_source_id)
  where status in ('submitted','review','needs_rights','draft');
create index novel_requests_queue on public.novel_requests(status, created_at)
  where status in ('submitted','review','needs_rights');
create index novel_requests_requester on public.novel_requests(requester_id, created_at desc);
create index novel_requests_work on public.novel_requests(work_id);

create table public.request_match_evidence (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.novel_requests(id) on delete cascade,
  kind text not null check (kind in ('exact','probable')),
  matched_work_id uuid references public.request_works(id) on delete set null,
  matched_source_id uuid references public.novel_sources(id) on delete set null,
  score numeric(5,4) not null default 0 check (score >= 0 and score <= 1),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  algorithm_version text not null,
  catalog_version text not null default '',
  created_at timestamptz not null default now(),
  check (matched_work_id is not null or matched_source_id is not null)
);
create index request_match_evidence_request on public.request_match_evidence(request_id);

create table public.request_moderation_decisions (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.novel_requests(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  from_status text not null,
  to_status text not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  request_version integer not null,
  decided_at timestamptz not null default now()
);
create index request_moderation_decisions_request
  on public.request_moderation_decisions(request_id, decided_at);

create table public.request_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.novel_requests(id) on delete cascade,
  work_id uuid references public.request_works(id) on delete set null,
  source_url text not null check (source_url ~ '^https://'),
  permitted_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permitted_metadata) = 'object'),
  rights_status text not null default 'pending'
    check (rights_status in ('pending','verified','expired','revoked')),
  rights_evidence_id uuid,  -- private.request_rights_evidence(id); never exposed to requesters
  converted_source_id uuid references public.novel_sources(id),
  publication_blocked boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private evidence is separated from the requester-visible tables.
create table private.request_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.novel_requests(id) on delete cascade,
  evidence_text text not null check (length(trim(evidence_text)) >= 20),
  stored_by uuid not null references auth.users(id),
  stored_at timestamptz not null default now(),
  valid_until date
);

-- Optional rate-limit counter for multi-instance deployments.
create table public.request_rate_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (bucket_key, window_start)
);
```

### 3.1 `request_works` — canonical work for requests

- Purpose: one logical work that several requests, titles, authors and external sources can point to **before** an editorial `novel_sources` row exists. It is a request-side identity, not a new catalog.
- Fields: `canonical_title`, `canonical_author`, normalized copies for matching, `state` (`proposed` → `confirmed` → `converted`, or `rejected`), `novel_source_id` set only when an administrator converts the work.
- Constraints: title length; `novel_source_id` nullable; normalized columns kept in sync by the application, not by the client.
- Relation: `novel_source_id → public.novel_sources(id)` (link, not copy). No `reader_*` relation.
- Lifecycle: proposed when first request arrives; confirmed by an editor/admin after resolving matches; converted once and only once into `novel_sources`; rejected if the work is not eligible. A converted work is immutable at the request layer.

### 3.2 `request_work_titles` — alternative titles

- Purpose: original, translated and alias titles for matching and moderator explanation.
- Constraints: `unique(work_id, normalized_title)` prevents duplicate aliases; language is a short ISO code or `und`.
- Lifecycle: appended by the moderation flow, never merged automatically. A title from one work is never copied to another without a moderator action recorded in a decision.

### 3.3 `request_work_authors` — author variants

- Purpose: author spellings/variants used as one advisory matching signal.
- Constraints: `unique(work_id, normalized_author)`.
- Lifecycle: appended on confirmation; matching author alone never creates an exact match.

### 3.4 `request_external_sources` — external identities

- Purpose: the recognized `(provider, external_id)` pair and its canonical URL. This is the uniqueness anchor for "same source".
- Constraints: `unique(provider, external_id)` — a second submission of the same external identity reuses the row via `on conflict do update set last_seen_at`. `canonical_url` and `host` are stored from the adapter, never from raw user input.
- Relation: optional `work_id`; a source may exist before it is linked to a work.
- Lifecycle: created on first recognized request; `last_seen_at` updated on resubmission; never deleted on request rejection (audit).

### 3.5 `novel_requests` — the request

- Fields: requester, submitted URL (exact text, for audit), recognized source, optional work, status, idempotency key, version for optimistic concurrency, client note.
- Statuses: `submitted` → `review` → (`needs_rights` ↔ `review`) → `draft` → `converted`, plus `rejected` (and back to `review` after appeal). Only a moderator can move the state; transitions are validated by the same rule set as the prototype's `transitions` table.
- Constraints: `unique(requester_id, idempotency_key)` makes a retry return the same request; partial unique index `novel_requests_active_source` prevents one requester from holding two open requests for the same external source.
- Indexes: moderation queue by `(status, created_at)`, requester history, work lookup.
- Lifecycle: created `submitted`; matching evidence is attached in the same transaction; a draft is created only after a moderator decision; conversion sets `status='converted'` and points at the created `novel_sources` row. Rejection never deletes history.

### 3.6 `request_match_evidence` — advisory matches with reasons

- Fields: `kind` (`exact`/`probable`), the matched work and/or existing published source, a score, a JSONB array of human-readable reasons, `algorithm_version`, optional `catalog_version`.
- Constraints: at least one target present; reasons must be a JSON array.
- Purpose: reproducibility and audit. Evidence is append-only per computation; it never changes a work or a published source by itself. Exact requires a recognized provider + external ID; everything else is `probable`.
- Lifecycle: written when a request is submitted or re-evaluated after catalog changes; old evidence rows remain, so a moderator can see what the machine saw at the time. Re-evaluation appends a new row; it does not rewrite history.

### 3.7 `request_moderation_decisions` — append-only history

- Fields: request, actor (`auth.users`), `from_status`, `to_status`, reason, the `request_version` the actor decided on, timestamp.
- Constraints: reason non-empty; statuses validated in the server function against the current row under `select ... for update`.
- No client can update or delete a decision row: `update`/`delete` privileges are not granted; RLS allows only `select` and the server function `insert` via `security definer`.
- Lifecycle: append-only. The current status lives on `novel_requests.status`; the history lives here.

### 3.8 `request_drafts` — draft with unverified rights

- Fields: request (unique), work, source URL, permitted metadata only (original title, alternative titles, authors, chapter titles — the same allow-list as the prototype), `rights_status` defaulting to `pending`, optional pointer to private evidence, optional `converted_source_id`, `publication_blocked` default true.
- Guarantees: `rights_status` starts `pending`; `publication_blocked` is true until an administrator both verifies rights through the existing `novel_guard_source` path and creates `novel_sources`. A draft cannot publish anything by itself.
- Lifecycle: created by the server after the decision that reaches `draft`; updated only by editors/admins; set to `converted_source_id` when the editorial source is created; never publishes.

### 3.9 `private.request_rights_evidence` — private rights proof

- Purpose: store the actual evidence text/pointer away from requester-visible tables.
- Access: no grants to `anon`/`authenticated`; only via a `security definer` function that re-checks `novel_staff.role='admin'` and writes an audit row. Editors see only `request_drafts.rights_status`, never the evidence body.
- Lifecycle: appended, never shown to the requester; expiration tracked in `valid_until` and by the existing rights check at publication time.

### 3.10 `request_rate_counters` — optional server-side throttling

- Purpose: survive multiple server instances; the edge/API layer writes a bucket (e.g. `user:<uuid>:hour`, `ip:<hash>:hour`) and counts.
- Lifecycle: rows older than the retention window may be deleted by a scheduled cleanup; deletion affects only counters.

## 4. Links to existing tables and the published site

- `request_works.novel_source_id → public.novel_sources(id)` — set once on conversion.
- `request_drafts.converted_source_id → public.novel_sources(id)` — same event, for traceability of the draft.
- `novel_requests.work_id → public.request_works(id)`.
- Published slug: `novel_sources.slug` (already unique, already mirrored by `src/content/novels/<slug>.json`). No slug is stored twice in request tables.
- `reader_chapter_registry`, `reader_xp_events`, `novel_reader_state`: **no foreign keys, no triggers, no writes** from request tables. Reader progress and XP stay exactly as they are.
- `novel_translation_jobs`: chapters are created only by editorial staff after conversion, through the existing admin flow and guards.

## 5. State machines

Request:

```
submitted ──▶ review ──▶ needs_rights ──▶ review ──▶ draft ──▶ converted
    │            │            │                        │
    └────────────┴────────────┴────────────────────────┴──▶ rejected ──▶ review (appeal)
```

- Only moderators (editor/admin) move the request out of `submitted`; only an admin performs `draft → converted`.
- `needs_rights` loops back to `review` after rights are documented; it never jumps to `draft`.
- `rejected` is terminal for the requester but re-openable by a moderator.

Work:

```
proposed ──▶ confirmed ──▶ converted
     └────────▶ rejected
```

- `confirmed` requires a moderator decision that resolves or explicitly accepts the advisory matches.
- `converted` requires an existing `novel_sources.id`.

## 6. Access model

Roles come only from `public.novel_staff` (`admin`/`editor`). Client-side checks, hidden buttons and JWT `user_metadata` are not authorization.

| Actor | Requests | Match evidence | Decisions | Drafts | Rights evidence | Convert |
| --- | --- | --- | --- | --- | --- | --- |
| Requester (`auth.uid() = requester_id`) | insert own; select own | select own, only `kind`, reasons and target ids (no other users' data) | select own requests' summary | select own draft status only | **no access** | no |
| Editor (`novel_staff.role='editor'`) | select queue/all; no delete | select | insert allowed transitions except conversion | select/update permitted metadata; no rights changes | no access (status only) | no |
| Admin (`novel_staff.role='admin'`) | all | all | all allowed transitions, including conversion | all | via `security definer` function only, with audit | admin-only |
| `service_role` | background jobs only, never in the browser | job writes only | none as a human | none as a human | none exposed | no |

Proposed policy sketch (proposal, not applied):

- `novel_requests`: `insert` with `check (requester_id = auth.uid())`; `select` for owner or staff; `update` **not** granted to clients — transitions happen through a `security definer` function that validates actor, reason, allowed transition and `version`.
- `request_match_evidence`: `select` for owner/staff, insert/update only by the service role inside the submit function.
- `request_moderation_decisions`: `select` for owner/staff; `insert` only inside the decision function; no `update`/`delete` grants to anyone.
- `request_drafts`: `select` owner (limited columns) / staff; `update` staff only; rights columns writable only by the admin rights function.
- `private.request_rights_evidence`: no grants to `anon`/`authenticated`, even if a policy mistake is later made — the schema-level revoke is the second line of defence.
- `request_rate_counters`: no client grants; written by the API layer with `service_role` or a dedicated function.

## 7. Server contract (proposal)

### 7.1 Submit a request

`POST /api/novel-requests` — authenticated, JSON.

Request body:

```json
{
  "url": "https://fiction-archive.test/work/4242",
  "note": "optional requester comment, <= 2000 chars",
  "metadata": {
    "originalTitle": "optional, adapter-supplied only",
    "alternativeTitles": ["optional"],
    "authors": ["optional"],
    "chapterTitles": [{ "number": 1, "title": "optional" }]
  }
}
```

Headers: `Authorization: Bearer <supabase-jwt>`, `Idempotency-Key: <8..128 chars>`.

Success `201 Created` (new) or `200 OK` (idempotent replay / active duplicate):

```json
{
  "requestId": "uuid",
  "status": "submitted",
  "deduplicated": "new | replay | active-request",
  "matches": [
    { "kind": "exact", "workId": "uuid|null", "publishedSourceId": "uuid|null",
      "reasons": ["Same recognized source and external ID"] }
  ],
  "rights": "unverified",
  "algorithmVersion": "requests-match-v1"
}
```

Errors: `400` invalid URL/body (including `http:`, credentials, port, unsupported host), `401` unauthenticated, `403` inactive account, `429` rate limited with `Retry-After`, `503` adapter disabled/unavailable. Error bodies never echo private data.

### 7.2 Read / history

`GET /api/novel-requests/:id` — owner or staff. Returns status, timestamps, match summaries, decision history summaries; never rights evidence text for anyone except an admin path that is separate and audited.

`GET /api/novel-requests?status=review&cursor=...` — staff only, cursor pagination, bounded page size.

### 7.3 Moderation decision

`POST /api/novel-requests/:id/decisions` — editor/admin.

Body: `{ "to": "review|needs_rights|draft|rejected|converted", "reason": "1..2000 chars", "expectedVersion": 3 }`.

The server, in one transaction:

1. `select ... from novel_requests where id = $1 for update`;
2. authorize the actor from `novel_staff` (server-side, not from the request body);
3. validate the transition using the same rules as `src/lib/novel-requests/core.ts` (`makeDecision`);
4. compare `expectedVersion` to the locked row; on mismatch return `409 Conflict` with the current version and the winning decision;
5. insert the decision row, update the request status and increment `version`;
6. on `converted`, require an existing `novel_sources.id` and set `work.state='converted'`; on `draft`, create the draft with `rights_status='pending'` and `publication_blocked=true`.

### 7.4 Authentication and rate limiting

- Authentication: Supabase JWT; the server resolves `auth.uid()`; a missing/expired token is `401`.
- Roles: fetched from `novel_staff` per request inside the transaction; never cached in a client-readable token claim.
- Rate limits (initial proposal, owner decides final numbers): per user 5 submissions/hour and 20/day; per IP hash 30/hour; decisions per moderator 100/hour. Idempotent replays do not consume quota. `429` includes `Retry-After`.
- Abuse signals (velocity, duplicate pressure) create a moderation flag, not an automatic block of a human.

### 7.5 Metadata retrieval bounds and SSRF

- Submission accepts a URL, not a fetch instruction. The server recognizes the source **only** through an explicitly enabled adapter; if no adapter matches, `400`.
- Adapters must define exact `host` + path patterns; every hop (including redirects) is validated against an allowlist; no private/link-local/metadata IPs; no credentials or non-standard ports; DNS re-checked after resolution.
- Timeouts, response size limits and egress allowlists are mandatory; chapter bodies, descriptions and covers are never fetched or stored by the request flow.
- In this phase no adapter is enabled; the prototype's `.test` adapter is a fixture only.
- A recognized URL and adapter metadata never prove translation or publication rights.

### 7.6 Handoff to the existing rights/QA pipeline

An approved draft does not publish anything. The handoff is:

1. Admin creates the editorial source through the existing `/admin` flow (or REST with an admin JWT). It starts with `rights_status='pending'`; the existing `novel_guard_source` requires an admin to verify rights with evidence ≥ 20 chars and both permissions.
2. The draft records `converted_source_id` and the work becomes `converted`.
3. Chapters enter via the existing `novel_translation_jobs` draft → review → approved flow with `novel_guard_job` QA (lengths, glossary, human notes, rights).
4. `publish-approved.yml` remains the only publisher: it revalidates rights/QA immediately before pushing and writes `novel_publication_events`.
5. If rights are unverified, expired or revoked, the draft stays blocked and cannot reach publication; revoking rights later affects the existing pipeline, not just the request.

## 8. Idempotency, duplicates and concurrency

- **Resubmission of the same source by the same user:** `unique(requester_id, idempotency_key)` + partial unique index on active statuses. The second call returns `200` with the existing request (`deduplicated: "active-request"`), appends no new request and does not consume quota.
- **Same source by a different user:** `request_external_sources` is shared; the second user gets a separate request. Moderators may merge requests into the same `request_works` row; works are never merged automatically.
- **Same work under different titles:** titles/authors live in child tables; matching produces `probable` evidence with reasons; a moderator confirms the work and records the reason. No automatic merge of works or sources.
- **Concurrent submissions:** `insert ... on conflict (provider, external_id) do update set last_seen_at` inside the submit transaction; a unique-violation on `(requester_id, idempotency_key)` is caught and translated into the replay response.
- **Two moderators on one request:** optimistic concurrency via `version` + `select ... for update`. The first commit wins; the second gets `409` with the winning decision and must reload. Decisions are append-only, so no update is lost.
- **Catalog changes between preview and decision:** match evidence is versioned (`algorithm_version`, `catalog_version`); a moderator decision is made against the stored evidence, and re-evaluation appends new evidence rather than rewriting it.

## 9. Worked examples

### 9.1 Repeat request for the same source

- User A submits `https://fiction-archive.test/work/4242` with `Idempotency-Key: k-1` → `201`, request `r1`, external source `s1`.
- Same user retries with the same key after a timeout → `200`, `deduplicated: "replay"`, request `r1`.
- Same user submits the same URL with a new key while `r1` is `review` → `200`, `deduplicated: "active-request"`, request `r1`.
- Another user B submits the same URL → new request `r2` sharing `s1`; both appear in the queue; a moderator may link them to one `request_works` row.

### 9.2 Different titles, one work

- Request `r3` has original title "The Lantern of Ninth Street"; request `r4` has "Фонарь Девятой улицы" and the same author spelling variant.
- Matching returns `probable` for `work-lantern` with reasons "Matching original or alternative title; Matching author". No merge occurs.
- A moderator confirms `request_works(work-lantern)` and adds the Russian title as an alias. The alias is recorded in `request_work_titles`; only the moderator decision changes identity.

### 9.3 Two moderators, one request

- Both moderators load request `r5` at `version=3`.
- Moderator 1 submits `{to:"review", expectedVersion:3}` → success, `version=4`, decision row `d1`.
- Moderator 2 submits `{to:"draft", expectedVersion:3}` → `409 Conflict` with current version `4` and the winning decision; must reload before deciding. No decision is overwritten.

### 9.4 Rights unverified or revoked

- A draft exists with `rights_status='pending'`, `publication_blocked=true`; the only way forward is a separate admin rights verification in the existing editorial flow.
- If an expired `rights_valid_until` or a revoked status is detected, the request returns to `needs_rights`; the draft remains blocked and cannot reach `publish-approved`.
- The requester sees "rights not verified"; the evidence body stays in `private.request_rights_evidence` and is never returned to requesters.

## 10. Migration and rollout plan (proposal)

1. Review this document and resolve the open decisions below.
2. Apply additive tables and policies only in a separate staging Supabase project; never on production as part of this PR.
3. Implement the server endpoint behind a disabled feature flag; no adapter enabled, no UI entry point.
4. Add the moderation queue to `/admin` with the existing role checks.
5. Enable one adapter only after its host/path allowlist, terms and SSRF controls are reviewed.
6. Keep `publish-approved.yml` as the only publisher; requests never bypass guards.
7. Allowlist `novel_requests` conversion for admins; monitor error and abuse metrics before enabling for all users.

## 11. Open decisions for the owner

1. Should `request_works` be the long-term canonical identity, or only a temporary staging concept? (Current proposal: temporary; `novel_sources` remains the editorial canonical record.)
2. Are requests visible only to their requester and staff, or is there any public "requested works" page?
3. Final rate-limit numbers and whether submissions require an account or allow authenticated-only.
4. Retention period for rejected requests, match evidence and rate counters.
5. Who may confirm work identity: editors or admins only?
6. Whether request tables live in `public` with the `request_` prefix or in a dedicated schema (current proposal: `public` prefix, private evidence in `private`).
7. Whether the first adapter should be metadata-only and manually curated.

## 12. Verification

Documentation only in this change: no code, schema, RLS, grant, migration or production change. The local prototype from the previous commit and the existing schema were re-checked against this proposal (field names, statuses, rights gate, moderation transitions, metadata allow-list). Project tests and build were run after the previous code change; see the commit for PR #62 and the PR description for results. This document must be reviewed by the owner before any migration is written or applied.
