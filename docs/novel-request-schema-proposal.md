# Novel request storage and server contract (proposal v2, not applied)

Status: **design proposal for review.** No table is created, no RLS policy or grant is changed, no migration is applied, and nothing in this document is deployed. It revises the first proposal (commit `b724efc`) after review and accompanies a separate SQL candidate in `docs/proposals/novel-requests-schema-draft.sql` (explicitly marked draft — the Supabase CLI is not installed in this environment, so it is not a generated migration).

Related: `docs/novel-request-foundation.md` (scope and local prototype), `backend/schema.sql` (existing editorial schema and guards), `backend/editorial-safety-20261027.sql`.

All numeric limits, retention periods and product choices below are **preliminary suggestions pending owner approval**, not agreed parameters.

## 1. Goals and non-goals

Goals: store a user request with its requester, the recognized external source, advisory match evidence, append-only moderation history and a draft whose rights are not verified; make creation, resubmission and concurrent moderation safe; reuse `public.novel_sources`, the existing rights/QA guards and publication pipeline; separate requester, editor and administrator access and keep private rights evidence out of requester reach.

Non-goals: real adapters, any network fetch, importing chapters/covers, AI images, changes to `reader_chapter_registry` / `reader_xp_events` / XP, and any production, DNS, Cloudflare, Discord or site change.

## 2. Existing structures reused

| Existing structure | Reuse |
| --- | --- |
| `public.novel_sources` (`id`, `slug` unique, `rights_status`, `permission_*`, `verified_by`, `verified_at`, `rights_evidence`, `rights_valid_until`) | Editorial canonical source. Conversion links to it; nothing is duplicated into request tables. Published slug = `novel_sources.slug` (same value as `src/content/novels/<slug>.json`). |
| `public.novel_translation_jobs` + `novel_guard_job()` | Chapters still pass draft → review → approved → published with rights/QA checks. |
| `public.novel_staff` (`role in ('admin','editor')`) | The only role source. JWT `user_metadata` is never used for authorization. |
| `scripts/publish-approved.mjs` + `publish-approved.yml` | The only publisher; revalidates rights/QA immediately before push. |
| `reader_chapter_registry`, `reader_xp_events`, `novel_reader_state` | Untouched and unlinked. Reader progress and XP never reference a request. |

## 3. Proposed data structures and the single creation path

### 3.1 Table inventory (fields, constraints, indexes, lifecycle)

All names are prefixed `request_`; DDL is in the SQL candidate. `request_*` tables never duplicate editorial or reader data.

- **`request_works`** — request-side work identity: `id`, `canonical_title`, `canonical_author`, `normalized_title`, `normalized_author`, `state ('proposed','confirmed','converted','rejected')`, `novel_source_id → public.novel_sources(id)`, timestamps. Constraints: `state='converted'` requires `novel_source_id`; unique partial index on `novel_source_id` (one editorial source per work). Lifecycle: proposed on first request, confirmed by a moderator, converted once, or rejected. `novel_sources` remains the editorial canonical record.
- **`request_work_titles`** — original/translated/alias titles: `work_id`, `title`, `language`, `normalized_title`, `kind ('original','alias','translated')`; `unique(work_id, normalized_title)`. Appended only by a moderator decision, never by automatic merging.
- **`request_work_authors`** — author spelling variants: `work_id`, `author_name`, `normalized_author`; `unique(work_id, normalized_author)`. An author match alone is never an exact identity.
- **`request_external_sources`** — recognized external identity: `provider`, `external_id`, `canonical_url`, `host`, `work_id`, `first_seen_at`, `last_seen_at`; `unique(provider, external_id)` is the uniqueness anchor for "same source"; index on `work_id`. Created on first recognized request, `last_seen_at` refreshed on resubmission, never deleted for audit.
- **`novel_requests`** — the request: `requester_id` (`on delete set null`), immutable pseudonymous `requester_ref`, `submitted_url`, `external_source_id`, `work_id`, `status`, `idempotency_key`, server-computed `request_fingerprint`, `client_note`, `version`, timestamps. Constraints: `unique(requester_ref, idempotency_key)`; partial unique index `(requester_ref, external_source_id)` for open statuses; status CHECK. Indexes: moderation queue `(status, created_at)`, requester history, work lookup. Lifecycle: created only by `request_create` in `submitted`; version increments on each transition; terminal `converted`/`rejected` (reopenable by admin).
- **`request_client_hints`** — untrusted user-provided hints (`payload jsonb`, `source='requester'`), one row per request. Never used as match input or identity; shown to moderators labelled as hints.
- **`request_adapter_metadata`** — adapter-provided metadata with provenance: `provider`, `adapter_version`, `policy_id`, `metadata jsonb`, `provenance`, `obtained_at`; index on `request_id`. Empty in this phase (no adapters enabled); the only source for matching input.
- **`request_match_evidence`** — advisory evidence: `request_id`, `kind ('exact','probable')`, `matched_work_id`, `matched_source_id`, `score`, `reasons jsonb`, `algorithm_version`, `catalog_version`, `created_at`; CHECK at least one target; append-only per computation (a re-evaluation appends, never rewrites).
- **`request_moderation_decisions`** — append-only history: `request_id`, `actor_id` (`on delete set null`), `actor_ref`, `actor_role ('editor','admin','system')`, `from_status`, `to_status`, `reason`, `request_version`, `decided_at`; index `(request_id, decided_at)`. No update/delete grants.
- **`request_drafts`** — local draft: `request_id` unique, `work_id`, `source_url`, `permitted_metadata jsonb` (allow-list only), `rights_status`, `rights_evidence_id → private.request_rights_evidence`, `converted_source_id → public.novel_sources` (unique partial), `publication_blocked`, `created_by/created_by_ref`, timestamps. Created only by the decision function after `review → draft`; never publishes.
- **`private.request_rights_evidence`** — private evidence body: `request_id`, `evidence_text` (≥ 20 chars), `stored_by` (`on delete set null`), `stored_by_ref`, `stored_at`, `valid_until`; no grants to `anon`/`authenticated`.
- **`request_rate_counters`** — optional server-side counters: `bucket_key`, `window_start`, `count`; primary key `(bucket_key, window_start)`. Preliminary mechanism; numbers pending.

Append-only children (`request_match_evidence`, `request_moderation_decisions`, `private.request_rights_evidence`, hints, adapter metadata, drafts) reference the request with `ON DELETE RESTRICT`, so a request cannot be deleted while its audit exists (§6).

### 3.2 Single secure creation path (no direct INSERT)

Problem with v1: a requester-side `INSERT` policy plus `insert ... returning` would let a client try to set fields the server must own (status, source, work, version, rights, decision history).

Rules fixed in v2:

- **No role gets INSERT/UPDATE/DELETE on request tables.** `revoke all on ... from anon, authenticated` and no write policies. Requests are created only through a server function.
- The only creation entry point is `private.request_create(p_url text, p_note text, p_idempotency_key text)` (SECURITY DEFINER, `search_path=''`), exposed to authenticated users through a thin `public.request_create(...)` wrapper. It accepts **only** those three parameters; there is no client-settable status, source, work, version, requester, rights or decision field.
- Inside the function the server derives everything else: `requester_id := auth.uid()`, source identity from the explicit adapter registry (disabled in this phase), `status := 'submitted'`, `version := 1`, work and match evidence from server-side code, timestamps from the database.
- The requester reads only from `request_owner_view` (see §7); staff read from `request_staff_view`. There are no direct `select` grants on base tables either, so even a mistaken future policy cannot expose extra columns.
- Rate limiting is enforced before insert inside the function (per-authenticated-user; IP limits belong to the API layer, which passes a hashed key — preliminary values pending approval, §8.4).
- `private.request_decide`, `private.request_convert`, `private.request_set_rights` are the only other write paths; each re-checks the actor in `novel_staff` inside the transaction.

## 4. Status transitions (one table shared by document, SQL candidate and prototype)

The structural transitions are identical in: this table, `src/lib/novel-requests/core.ts` (`transitions`) and the validation inside the proposed SQL functions. The pure TypeScript core validates only structural transitions; role checks, rights and conversion preconditions are enforced server-side.

| From | To | Allowed actor | Additional server preconditions |
| --- | --- | --- | --- |
| `submitted` | `review` | editor, admin | none |
| `submitted` | `rejected` | admin | reason required |
| `review` | `needs_rights` | editor, admin | reason required |
| `review` | `draft` | editor, admin | work resolved; rights may still be `pending` |
| `review` | `rejected` | admin | reason required |
| `needs_rights` | `review` | editor, admin | reason required |
| `needs_rights` | `rejected` | admin | reason required |
| `draft` | `review` | admin | reopen; reason required |
| `draft` | `converted` | admin | existing `novel_sources` row already created by the editorial flow; link consistency checks (§9) |
| `draft` | `rejected` | admin | reason required |
| `rejected` | `review` | admin | appeal/reopen; reason required |
| `converted` | — | — | terminal; rights changes happen in the editorial pipeline (§5.2) |

The local prototype stops at `draft` because it has no database and no editorial role; `converted` is a server/database transition only. `src/lib/novel-requests/core.ts` includes `converted` in the structural transition table so the three sources cannot drift; the prototype never produces it on fictional data.

### 4.1 Rights revoked after a draft exists

- `private.request_set_rights(request, 'revoked')` records a decision, sets the draft to `rights_status='revoked'`, `publication_blocked=true` and moves the request to `needs_rights` (allowed from `draft` via a rights-only path recorded as a decision from `draft` to `needs_rights`; this transition is not a moderator choice but a rights event, and is recorded with `actor_id`/`reason`).
- The draft cannot publish; conversion stays blocked until rights are documented again and an admin returns the request to `review`/`draft`.

### 4.2 Rights revoked after conversion

- After conversion the request is terminal (`converted`); the authoritative rights record is `novel_sources.rights_status` (see §5).
- The mirror in `request_drafts` is updated by the sync trigger; the draft becomes `publication_blocked=true`.
- Publication is already blocked by the existing `novel_guard_job`/publisher checks, which re-read `novel_sources` at approval and at publish time. The request layer never overrides that; it only surfaces the change to staff and requester views.

## 5. Rights authority (no two independent truths)

At any moment exactly one place is authoritative; the other is a projection with a named owner and a drift check.

| Stage | Authoritative | Projection / read model | Write path |
| --- | --- | --- | --- |
| Before conversion (`submitted`…`draft`) | `request_drafts.rights_status` + `private.request_rights_evidence` (evidence body) | `request_owner_view.rights_status` | only `private.request_set_rights` (admin), which also writes evidence and an audit decision |
| After conversion (`converted`) | `public.novel_sources.rights_status` (existing guards) | `request_drafts.rights_status` mirror, kept in sync by trigger `private.request_draft_rights_mirror()` | editorial flow only; request functions refuse to change rights once `converted_source_id` is set |

Prevention of divergence:

- `request_drafts.rights_status` has a CHECK limited to `pending/verified/expired/revoked`, and a trigger rejects changes when `converted_source_id is not null` unless the change comes from the mirror trigger.
- At conversion the function copies `novel_sources.rights_status` into the draft inside the same transaction.
- A consistency query (`request_consistency_report`, §9.3) must return zero rows: drafts converted to a source whose status differs, requests whose work/source links disagree, works with two sources, converted requests without a draft link.
- The API never exposes a rights boolean derived from cached copies: before conversion it reads the draft, after conversion it reads `novel_sources` through the link.

## 6. Audit and retention (no CASCADE on audit)

v1 used `ON DELETE CASCADE`, which contradicts append-only audit. v2 separates identity from audit:

- `novel_requests.requester_id → auth.users(id) ON DELETE SET NULL` plus immutable `requester_ref text` (a pseudonymous hash written at creation from `auth.uid()`), so deleting a user anonymizes the request but does not erase it.
- `request_moderation_decisions.actor_id → auth.users(id) ON DELETE SET NULL` plus `actor_ref` and `actor_role` snapshots.
- `private.request_rights_evidence.stored_by → auth.users(id) ON DELETE SET NULL` plus `stored_by_ref`.
- Audit children reference the request with `ON DELETE RESTRICT` (decisions, evidence, match evidence), so a request cannot be deleted while its audit exists. Deleting a request is not a normal operation.
- Default retention: keep anonymized requests, drafts, decisions and evidence indefinitely. Retention periods (preliminary, owner decides): requests/drafts 24 months after terminal state, audit decisions 36 months, rate counters 30 days, then anonymize or delete through an explicit retention job. Until the owner approves numbers, nothing purges automatically.
- A future retention job runs as `service_role`, exports/audits first, deletes in the order evidence → decisions → matches → draft → request, and is itself audited.

## 7. Field-level access (RLS does not hide columns)

RLS filters rows, not columns. Therefore:

- No `select` grants on base request tables for `anon`/`authenticated`. Both read from views with explicit column lists.
- `public.request_owner_view` (owner-rights view created by the migration role; its `WHERE r.requester_id = auth.uid()` clause is the security boundary and must be reviewed and tested) exposes to the owner: `id`, `status`, `created_at`, `updated_at`, `source_host`, `matches` summary (kind + reasons only, no other users' data), `rights_status` (as authoritative signal), `can_convert` boolean. It never exposes `client_note` of other users, internal notes, version internals, fingerprints or rights evidence.
- `public.request_staff_view` (owner-rights view; `WHERE exists (select 1 from novel_staff ...)` is the security boundary) adds requester ref, algorithm/catalog versions, decision summary and editorial fields.
- `client_note` is visible to its author and staff; hints are visible to staff only.
- Private evidence: no grants at all to `anon`/`authenticated`; only a SECURITY DEFINER function with an admin check and audit returns it.
- API responses follow the same projections; the server never serializes a whole row.
- Views with owner rights bypass RLS by design: each view must be reviewed as a security boundary, covered by role tests in staging, and never exposed with `grant select ... to public`. The alternative (security_invoker views plus column-level grants) is listed as an open decision in §12.

## 8. Server contract (proposal)

### 8.1 Create a request

`POST /api/novel-requests`, authenticated, JSON:

```json
{
  "url": "https://fiction-archive.test/work/4242",
  "note": "optional requester comment",
  "idempotencyKey": "client-generated 8..128 chars",
  "clientHints": {
    "originalTitle": "user-provided hint, untrusted",
    "alternativeTitles": ["..."],
    "authors": ["..."],
    "chapterTitles": [{"number": 1, "title": "..."}]
  }
}
```

`clientHints` are **user hints, not adapter metadata**. They are stored in `request_client_hints` with `source='requester'`, are shown to moderators labelled as unverified, and are **never** used as match input or as identity. Matching uses only `request_adapter_metadata`, which in this phase has no adapters and therefore stays empty.

Responses:

- `201 Created` — new request: `{requestId, status:"submitted", deduplicated:"new", matches:[{kind, reasons, targetIds}], rights:"unverified", algorithmVersion, provisional:true}`;
- `200 OK` — idempotent replay with the **same** body fingerprint: `{requestId, deduplicated:"replay", ...}`;
- `200 OK` — active request for the same source by the same user: `{deduplicated:"active-request", requestId}`;
- `409 Conflict` — same `Idempotency-Key` with a **different** body: `{error:"idempotency-key-reused", existingRequestId}`; the request is not modified;
- `400` invalid URL/body (http, credentials, port, unsupported host, too long), `401` unauthenticated, `403` inactive account, `429` rate limited (`Retry-After`), `503` adapter registry disabled.

Fingerprint: server computes `sha256(canonical_url || '\n' || canonical_json(clientHints) || '\n' || note)`; the fingerprint is not accepted from the client and is compared on replay.

### 8.2 Read and history

- `GET /api/novel-requests/:id` — owner (owner view) or staff (staff view); never returns evidence bodies.
- `GET /api/novel-requests?status=review&cursor=…` — staff only, cursor pagination (preliminary page size 25).
- Decisions are returned as summaries (`from`, `to`, `actorRef`, `reason`, `decidedAt`); the full audit stays server-side.

### 8.3 Moderation decision

`POST /api/novel-requests/:id/decisions` — editor/admin; body `{to, reason, expectedVersion}`.

Inside one transaction: lock request `FOR UPDATE`; resolve actor from `novel_staff` server-side; validate the structural transition (same table as §4); if `to='converted'`, run conversion checks (§9); compare `expectedVersion` with the locked row, mismatch → `409 Conflict` with current version and winning decision; insert append-only decision; update status/version; create the draft with `rights_status='pending'` on `review → draft`.

Optimistic concurrency: `version` increments on every successful transition; two moderators starting at version 3 → the second receives `409` and must reload. No decision is overwritten.

### 8.4 Authentication and rate limiting (values preliminary, owner to approve)

- Supabase JWT; `auth.uid()` resolved server-side; missing/expired → `401`.
- Roles read from `novel_staff` inside the transaction; never from token claims.
- Preliminary: 5 submissions/hour and 20/day per user; 30/hour per hashed IP (API layer); 100 decisions/hour per moderator. Idempotent replays do not consume quota. `429` includes `Retry-After`. All numbers are placeholders, not approved.

### 8.5 Metadata acquisition and SSRF (future adapters)

- The submission accepts a URL, never a fetch instruction. Only explicitly enabled adapters recognize sources; no adapter is enabled in this phase.
- For any future fetch, one DNS check before the request is not enough. Required verification sequence:
  1. parse and canonicalize the URL: `https` only, port 443 only, no credentials, host in the adapter allowlist, path matching the adapter pattern;
  2. resolve the host and validate **every** returned A/AAAA against deny lists (loopback, private, link-local, CGNAT, multicast, documentation, cloud metadata, broadcast);
  3. connect to the validated IP directly with SNI/Host headers; verify the TLS certificate against the hostname; never re-resolve between validation and connect (prevents DNS rebinding);
  4. on every redirect (max 3, no downgrade to http, no new host outside the allowlist) repeat steps 1–3 for the new address;
  5. rate-limit, timeout and size-cap the response; do not follow redirects outside the allowlist; never store bodies, covers or descriptions;
  6. record adapter id/version and policy id as provenance in `request_adapter_metadata`.
- A recognized URL and adapter metadata are not evidence of translation or publication rights.

### 8.6 Handoff to the existing rights/QA pipeline

The request never publishes and never bypasses guards:

1. Admin creates the editorial source through the existing `/admin` flow or REST with an admin JWT; it starts with `rights_status='pending'`.
2. `private.request_convert(request, source, expectedVersion)` links it transactionally (§9).
3. Rights are verified only through existing `novel_guard_source` (admin, evidence ≥ 20 chars, both permissions, validity date). The request layer cannot mark rights verified after conversion.
4. Chapters go through `novel_translation_jobs` and `novel_guard_job`, then `publish-approved.yml` revalidates and publishes.
5. Unverified/expired/revoked rights keep the draft blocked; revocation after conversion is reflected by the mirror trigger and by the existing publication checks.

## 9. Conversion consistency

### 9.1 One transaction

`private.request_convert(p_request uuid, p_source uuid, p_expected_version int)` (admin only) does all of the following or nothing:

1. lock the request `FOR UPDATE`; require `status='draft'`, `version=p_expected_version`, a draft row exists, `draft.converted_source_id is null`;
2. require `request.work_id is not null` and `request_external_sources.work_id = request.work_id` (the external source was linked to the work during moderation);
3. verify `public.novel_sources(p_source)` exists; it may still have `rights_status='pending'` (conversion is editorial, not publication);
4. reject if any other work already points at `p_source` (unique partial index) or if any request already converted to it;
5. set `request.status='converted'`, `work.state='converted'`, `work.novel_source_id=p_source`, `draft.converted_source_id=p_source`, copy `source.rights_status` into the draft mirror, `publication_blocked := rights_status <> 'verified'`, `version := version + 1`;
6. insert the conversion decision.

### 9.2 Constraints and checks

- unique partial index on `request_works(novel_source_id) where novel_source_id is not null`;
- unique on `request_drafts.converted_source_id`;
- CHECK: `request_works.state='converted'` requires `novel_source_id is not null`;
- trigger `private.request_draft_guard()`: rejects setting `converted_source_id` outside the conversion function; rejects rights mirror edits outside the mirror trigger; rejects any change that would break `draft.converted_source_id = work.novel_source_id`;
- `novel_requests.external_source_id` is fixed after creation; a trigger rejects changing it and changing `work_id` after `converted`;
- no triggers or writes touch `novel_sources` except the existing editorial guards; the request layer only links and reads.

### 9.3 Drift report

`request_consistency_report()` (proposal) returns rows where:
`draft.converted_source_id <> work.novel_source_id`, converted request without draft link, draft rights mirror differs from `novel_sources.rights_status`, external source not linked to its request's work, work with more than one `novel_sources` link. Expected result in a healthy system: zero rows.

## 10. Worked examples

### 10.1 Same source, repeated submissions

- User A submits URL with `Idempotency-Key: k-1` → `201`, request `r1`, source `s1`, fingerprint `f1`.
- Retry with the same key and same body → `200 deduplicated:"replay"`, request `r1`.
- Same key with a **different** URL or different hints → `409 idempotency-key-reused`, existing `r1` untouched.
- Same URL with a new key while `r1` is open → `200 deduplicated:"active-request"`, `r1`.
- Another user B submits the same URL → new request `r2` sharing `s1`; both appear in the queue; a moderator may link both to one work, never automatically.

### 10.2 Same work under different titles (no invented alias detection)

- Request `r3` has adapter metadata title "The Lantern of Ninth Street"; request `r4` has the Russian title "Фонарь Девятой улицы".
- Unless a known alias already exists in `request_work_titles` (or in a future multilingual index), the current algorithm does **not** know the two are the same work. It returns no match or, at most, an author-only probable signal if normalized authors coincide.
- Recording the Russian title as an alias is a **moderator task** or a future algorithm capability; the doc does not claim the current prototype detects translations. Once the moderator confirms and adds the alias, subsequent requests can produce a `probable` title match.
- Alias creation is an explicit decision; works are never merged automatically.

### 10.3 Two moderators on one request

- Both load request `r5` at `version=3`.
- Moderator 1 submits `{to:"review", expectedVersion:3}` → success, `version=4`, decision `d1`.
- Moderator 2 submits `{to:"draft", expectedVersion:3}` → `409`, current version 4, winning decision `d1`; must reload. No history is lost or overwritten.

### 10.4 Rights unverified or revoked

- Draft exists with `rights_status='pending'`, `publication_blocked=true`; requester sees "rights not verified", evidence body stays private; only an admin can document rights through `private.request_set_rights`, and only the editorial flow can verify against `novel_sources`.
- Revoked before conversion: request returns to `needs_rights`, draft blocked, conversion refused.
- Revoked after conversion: `novel_sources` is authoritative; the mirror updates the draft, existing guards block approval/publication, and staff/requester views surface `rights_status='revoked'`. The request itself stays `converted` (terminal) — reopening it is not a rights operation.

## 11. Migration and rollout (proposal)

1. Review this document and the SQL candidate; owner approves the open decisions.
2. Apply the candidate only in a **separate staging** Supabase project, via the standard CLI migration flow after review; never in production as part of PR #62.
3. Implement server functions/endpoint behind a disabled feature flag; no adapter enabled, no UI entry.
4. Add the moderation queue to `/admin` using existing role checks.
5. Enable one metadata-only adapter after allowlist/terms/SSRF review.
6. Keep `publish-approved.yml` as the only publisher; monitor abuse metrics before enabling for all users.

## 12. Open decisions for the owner (all provisional)

1. `request_works`: temporary staging concept or long-term canonical identity? (proposal: temporary; `novel_sources` remains canonical.)
2. Request visibility: requester + staff only, or a public "requested works" list?
3. Rate limits, storage of IP hashes, and whether submissions require an account.
4. Retention: periods for requests, audit, evidence, rate counters; anonymize vs hard delete.
5. Who may confirm work identity and create aliases — editors or admins only?
6. Schema placement: `public` with `request_` prefix vs a dedicated schema (proposal: `public` prefix; private evidence in `private`).
7. First adapter scope (metadata-only, manual review) and which hosts are allowed.
8. Whether conversion may happen while rights are still `pending` (proposal: yes — conversion is editorial; publication is separate).
9. Read-path hardening: owner-rights views (current proposal) vs `security_invoker` views plus column-level grants; whether staging role tests run before enabling any request UI.

## 13. Verification

- Documentation revision + SQL candidate: static only. **The SQL was not executed against any Postgres** (no local/staging/production run, no Supabase CLI available), so static review does not prove migration correctness, trigger semantics or RLS behavior. A staging transaction test plus role tests are required before any application.
- SQL candidate location: `docs/proposals/novel-requests-schema-draft.sql`, explicitly marked as a draft, not a generated migration; it must be moved to `supabase/migrations/` later via the CLI after owner approval.
- Consistency with code: `src/lib/novel-requests/core.ts` transition table now includes `converted`; `tests/novel-request-scenario.test.mjs` asserts, for every status pair, exactly the transitions in §4. The local prototype remains fictional and stops at `draft` (no database, no editorial role); `converted` is a server-only transition.
- Checks run for this revision: `node --test tests/novel-requests.test.mjs tests/novel-request-scenario.test.mjs` — 17/17 pass; `node --test tests/*.test.mjs` — 68/68 pass; `npm run build` — exit 0, 285 pages. Build was run because `core.ts` changed.
- No database, RLS, grants, production, domains, Discord or XP were changed; no migration was applied.
