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
- **`request_drafts`** — local draft: `request_id` unique, `work_id`, `source_url`, `permitted_metadata jsonb` (allow-list only), `rights_documentation_state ('none','documented','expired','revoked')` — documentation only, never a verified-rights status, `rights_evidence_id → private.request_rights_evidence`, `converted_source_id → public.novel_sources` (not unique: several requests may convert to the same existing work/source), `request_blocked` (request-layer hold only; not evidence of permission), `created_by/created_by_ref`, timestamps. Created only by the decision function after `review → draft`; never publishes.
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
- `private.request_decide`, `private.request_convert`, `private.request_document_rights` are the only other write paths; each re-checks the actor in `novel_staff` inside the transaction.

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

### 4.1 Rights documentation expires or is revoked before conversion

- Before conversion there is **no verified rights state anywhere** for the request: no `novel_sources` row exists yet, so rights are unverified by definition. The request layer only records documentation: `private.request_document_rights` may store evidence and set `rights_documentation_state='documented'|'expired'|'revoked'`; this is not an authoritative rights status and cannot unblock publication.
- Expired/revoked documentation moves the request to `needs_rights` through the decision path (`draft → needs_rights` is a rights event recorded with actor, reason and version). Conversion remains an editorial link operation and does not imply rights.
- The draft keeps `request_blocked=true`; no publish path exists in the request layer.

### 4.2 Rights revoked after conversion

- After conversion the request is terminal (`converted`) and the only authoritative rights record is `public.novel_sources.rights_status` (see §5). There is no request-side mirror and no trigger on existing tables: values are read by joining `novel_sources` in the views.
- Publication is already blocked by the existing `novel_guard_job`/publisher checks, which re-read `novel_sources` at approval and at publish time. A revocation therefore blocks publication in the existing pipeline; the request layer only surfaces `source_rights_status='revoked'` to staff and requester views. The request is not reopened — that is an editorial action, not a rights operation.

## 5. Rights authority (single authoritative record per stage)

There is no request-layer "verified rights" value at all, so two independent truths cannot exist.

| Stage | Authoritative record | What the request layer stores | How it is read |
| --- | --- | --- | --- |
| Before conversion (`submitted`…`draft`) | **None** — no `novel_sources` row exists; rights are unverified by definition | Evidence pointer and `rights_documentation_state` (`none/documented/expired/revoked`); `request_blocked` hold | Owner/staff views return the documentation state and `request_blocked`; nothing is presented as verified |
| After conversion (`converted`) | `public.novel_sources.rights_status`, `permission_*`, `rights_evidence`, `verified_by`, `verified_at`, `rights_valid_until` | Only the link `converted_source_id`; no copied status | Views join `novel_sources` at query time and expose `source_rights_status`, `source_rights_valid_until`, plus an explicitly advisory `advisory_source_rights_look_complete` |

Rules:

- `advisory_source_rights_look_complete` mirrors part of the existing predicate (verified, both permissions, evidence length, non-expired date) purely as UI/informational advice. It is **not** proof of rights and is not consulted for publication.
- Publication authority is `novel_guard_job` plus the publisher (`publish-approved.mjs`), which re-check `novel_sources` at approval time and again immediately before push. Those checks remain mandatory and authoritative.
- `rights_documentation_state='documented'` never means "verified"; the only values that can gate publication are the existing `novel_sources` fields and guards.
- A consistency query can still detect a stale UI assumption; the drift report (§9.3) checks links, not rights, because rights live in one place only.
- No trigger is created on `novel_sources` and no existing table is modified: the request layer only reads it through joins.

## 6. Audit, technical roles and retention

Identity is separated from audit, and audit claims are limited to what SQL can actually show.

**No CASCADE on audit:**

- `novel_requests.requester_id → auth.users(id) ON DELETE SET NULL` plus immutable `requester_ref` (pseudonymous hash written at creation), so deleting a user anonymizes the request but never erases it.
- `request_moderation_decisions.actor_id → auth.users(id) ON DELETE SET NULL` plus `actor_ref` and `actor_role` snapshots; the same pattern is used for private evidence (`stored_by`/`stored_by_ref`) and draft creators.
- Audit children reference the request with `ON DELETE RESTRICT` (decisions, evidence, match evidence, hints, adapter metadata, drafts), so a request cannot be deleted while its audit exists. Deleting a request is not a normal application operation.

**Technical roles (proposed):**

| Role | Access to request data | Notes |
| --- | --- | --- |
| `anon` | none | views/tables not granted |
| `authenticated` | SELECT on `request_owner_view` (own rows) and `request_staff_view` (novel_staff only) | no DML; writes only through functions |
| `service_role` | SELECT on request tables and private evidence; EXECUTE on the diagnostic function only | **no INSERT/UPDATE/DELETE** on request or audit tables |
| table owner / migration role | owns tables and functions; can bypass guards with DDL | documented privileged exception |
| `postgres`/superuser | full bypass | outside the guarantee |

**Observable guarantees vs exceptions:**

- INSERT/UPDATE/DELETE on audit tables is revoked from `anon`, `authenticated` and `service_role`. Normal application SQL cannot alter or delete history; `BEFORE UPDATE OR DELETE` triggers raise for these paths.
- `SECURITY DEFINER` functions perform inserts on audit tables when implemented; they never update or delete existing audit rows.
- **Not claimed:** absolute immutability. The table owner can `ALTER TABLE ... DISABLE TRIGGER`, a superuser bypasses everything, and a role with DDL rights can drop triggers. If the threat model includes privileged DB roles, an external audit trail (WAL shipping, log pipeline, periodic hash anchoring) must be added separately — out of scope for this candidate.
- `service_role` is not a "superuser substitute": it is read-only here by design, and any future job needing writes must use a reviewed `SECURITY DEFINER` function with its own checks.

**Retention (preliminary, owner decision):** default is to keep anonymized requests, drafts, decisions and evidence indefinitely; example periods under discussion are requests/drafts 24 months after a terminal state, audit 36 months, rate counters 30 days. Nothing purges automatically until the owner approves numbers and a retention job design (which would have to use privileged maintenance and be audited separately).

## 7. Field-level access, views and function security

RLS filters rows, not columns. Therefore:

- No `SELECT` grants on base request tables for `anon`/`authenticated`. Both read through two projections with explicit column lists. `anon` gets nothing.
- `public.request_owner_view` — runs with the **owner role's** rights (`security_invoker = false`); its `WHERE r.requester_id = auth.uid()` clause is the security boundary. Columns: `id`, `status`, timestamps, `source_host`, `rights_documentation_state`, `request_blocked`, `converted`, `source_rights_status`, `source_rights_valid_until`, `advisory_source_rights_look_complete`, `matches` summary (kind + reasons only). It never exposes `client_note` of other users, internal notes, fingerprints, versions or rights evidence bodies.
- `public.request_staff_view` — owner-rights view; `WHERE exists (select 1 from novel_staff ...)` is the security boundary. Adds `requester_ref`, provider/external id, `rights_documentation_state`, `converted_source_id`, `source_rights_status`, `has_editorial_source`. It does not expose private evidence.
- `client_note` is visible to its author and to staff; hints are visible to staff only; private evidence is visible to no one through these views.
- Base tables: all privileges revoked from `anon`, `authenticated`, `public` and `service_role`; only owner/table-owner functions write.
- `SECURITY DEFINER` functions (future): each must set `search_path = ''`, schema-qualify every object, check `auth.uid()` and `novel_staff` inside, avoid dynamic SQL, and be granted `EXECUTE` only to the exact role that needs it (`authenticated` for `public.request_create`, staff wrappers for decisions, nothing for admin-only functions except admins via a wrapper that re-checks role). `revoke execute ... from public` is mandatory.
- **Owner/role model is not final.** Two options are open: (a) owner-rights views and definer functions owned by a dedicated `request_owner` role with only the needed privileges (current SQL candidate documents this but does not create the role — creating roles needs owner/superuser approval); (b) `security_invoker` views plus column-level grants. Until the owner picks one and staging role tests pass, access remains closed by default: no UI, no production grant, no endpoint enabled.
- Views with owner rights bypass RLS by design. They must be treated as security boundaries, covered by role tests (see the test plan), and never granted to `public`.
- API responses follow the same projections; the server never serializes a whole row.

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

Inside one transaction: lock request `FOR UPDATE`; resolve actor from `novel_staff` server-side; validate the structural transition (same table as §4); if `to='converted'`, run conversion checks (§9); compare `expectedVersion` with the locked row, mismatch → `409 Conflict` with current version and winning decision; insert append-only decision; update status/version; create the draft with `rights_documentation_state='none'` and `request_blocked=true` on `review → draft`.

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

1. Admin creates the editorial source through the existing `/admin` flow or REST with an admin JWT; it starts with `rights_status='pending'` and is verified only by `novel_guard_source` (admin, evidence ≥ 20 chars, both permissions, validity date). The request layer cannot set `novel_sources` rights.
2. `private.request_convert(request, source, expectedVersion)` links the request/work/draft to the existing source in one transaction (§9). Conversion neither verifies rights nor publishes; it may happen while rights are still `pending` (open decision §12).
3. Effective rights are always read from `novel_sources` (views join it); the request layer stores no copied status and no trigger is placed on existing tables.
4. Chapters go through `novel_translation_jobs` and `novel_guard_job`, then `publish-approved.yml` revalidates rights/QA immediately before push and writes `novel_publication_events`.
5. Unverified/expired/revoked rights keep publication blocked by those existing guards; the request views only surface `source_rights_status`. Nothing in the request layer can make a chapter publishable.

## 9. Conversion consistency

### 9.1 One transaction, several requests may share one work and source

`private.request_convert(p_request uuid, p_source uuid, p_expected_version int)` (admin only) does all of the following or nothing:

1. lock the request `FOR UPDATE`; require `status='draft'`, `version=p_expected_version`, a draft exists, `draft.converted_source_id is null`, `request.work_id is not null`;
2. require `request_external_sources.work_id = request.work_id`;
3. require the `public.novel_sources(p_source)` row exists (rights may still be `pending`);
4. reuse the existing work link: if `request_works.novel_source_id` is null, set it; if it already equals `p_source`, continue (another request was converted to the same editorial source); if it points to another source, raise an error. This lets several requests share one work and one source without duplicating `novel_sources`;
5. set `request.status='converted'`, `work.state='converted'`, `draft.converted_source_id=p_source`, `request_blocked=false`, `version := version + 1`;
6. insert the conversion decision (append-only).

No workaround creating a duplicate `novel_sources` row is allowed or needed.

### 9.2 What the database enforces vs what still depends on the future function

| Guarantee | Enforced by |
| --- | --- |
| `(provider, external_id)` identifies one external source | unique index — DB |
| One open request per requester + source | partial unique index — DB |
| Idempotency key unique per requester ref | unique constraint — DB |
| One work per `novel_sources` link | unique partial index — DB |
| Converted work has a source; statuses valid | CHECK constraints — DB |
| Request, external source and work link agree | deferred constraint trigger on new tables — DB (checked at commit) |
| Draft work/source agree with request/work | deferred constraint trigger on new tables — DB (checked at commit) |
| Converted draft link immutable | trigger on new table — DB |
| Cross-request conversion reuses the existing work link | planned `request_convert` function — **not implemented** |
| Only an admin converts; only staff decide; version check | planned functions — **not implemented** |
| Actor/role resolution from `novel_staff` | planned functions — **not implemented** |
| Conversion does not verify rights and cannot publish | existing guards + absence of rights writes — partly DB (guards), partly planned |

The failure of a deferred trigger aborts the whole transaction, so a conversion cannot leave half-updated links.

### 9.3 Drift report (corrected)

v1's last check grouped by work and used `count(novel_source_id)` over a single-row work row, which can never detect multiple sources — it was wrong. v2 removes it: one work per `novel_sources` link is already guaranteed by the unique partial index, so no group-by heuristic is needed.

`public.request_consistency_report()` checks only what multi-row queries can see and what indexes cannot express:

- `draft_source_differs_from_work` — converted draft link differs from the work link;
- `converted_without_draft_link` — converted request has no converted draft;
- `converted_request_work_not_converted` — request converted while the work state is not `converted`;
- `external_source_work_mismatch` — external source is linked to a different work than the request.

Expected result: zero rows. The report is diagnostic only, owned by the migration role, `search_path=''`, and its `EXECUTE` is revoked from `public`/`authenticated` (service_role only) until the owner model is decided.

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

### 10.4 Rights unverified, expired or revoked

- Before conversion no `novel_sources` row exists, so rights are unverified by definition. A draft may hold private evidence with `rights_documentation_state='documented'`, but that is documentation, not a verified status; `request_blocked` stays true. Requesters see "rights not verified"; evidence bodies stay private.
- Expired or revoked documentation before conversion moves the request to `needs_rights` (recorded decision) and keeps it blocked. Conversion remains a separate editorial link step; per open decision §12.8 it may happen while rights are pending, but it never makes anything publishable.
- After conversion, `novel_sources.rights_status` is authoritative. If it becomes `revoked` or `expired`, `novel_guard_job` blocks approval/publication, and the views surface `source_rights_status` and `source_rights_valid_until` to staff and requester. There is no request-side mirror to update: the value is joined at read time. The request stays `converted` (terminal); reopening it is an editorial action, not a rights operation.

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
4. Retention: periods for requests, audit, evidence, rate counters; anonymize vs hard delete; whether any privileged hard deletion is allowed at all.
5. Who may confirm work identity and create aliases — editors or admins only?
6. Schema placement: `public` with `request_` prefix vs a dedicated schema (proposal: `public` prefix; private evidence in `private`).
7. First adapter scope (metadata-only, manual review) and which hosts are allowed.
8. Whether conversion may happen while rights are still `pending` (proposal: yes — conversion is editorial; publication is separate).
9. Owner/role model for views and `SECURITY DEFINER` functions: dedicated `request_owner` role (needs owner/superuser approval to create) vs `security_invoker` views with column grants; and whether owner-rights views are acceptable at all.
10. `service_role` write policy: candidate keeps it read-only; any future background job that must write (retention, re-evaluation) needs a reviewed definer function or an explicitly privileged maintenance path.
11. Approval to create a disposable staging database and run the prepared test plan (no test has been executed yet).
12. Whether any tamper-evidence beyond SQL triggers is required (external audit trail for privileged DB roles).

## 13. Verification

- Documentation revision + SQL candidate: static only. **The SQL was not executed against any Postgres** (no local, staging or production run; no Supabase CLI available), so static review does not prove migration correctness, trigger semantics or RLS behaviour. The test plan in `docs/proposals/novel-requests-test-plan.md` is prepared but not run; creating a test database requires separate owner approval.
- SQL candidate location: `docs/proposals/novel-requests-schema-draft.sql`, explicitly marked as a draft, not a generated migration; it must be moved to `supabase/migrations/` later via the CLI after owner approval.
- Scope guard re-checked statically: the candidate creates no trigger, policy, grant or column change on existing tables; `novel_sources` is only referenced by FK and joined in views.
- Consistency with code: `src/lib/novel-requests/core.ts` transition table includes `converted`; `tests/novel-request-scenario.test.mjs` asserts, for every status pair, exactly the transitions in §4. The local prototype remains fictional and stops at `draft`.
- Static checks performed for this revision: table inventory vs SQL candidate table list; status list in SQL vs `core.ts`; transitions in `core.ts` vs §4; no existing table named in `create/alter/drop` statements; audit triggers and grants reviewed manually.
- TypeScript checks (unchanged logic except the previous `converted` addition): `node --test tests/novel-requests.test.mjs tests/novel-request-scenario.test.mjs` — 17/17; `node --test tests/*.test.mjs` — 68/68; `npm run build` — exit 0, 285 pages.
- No database, RLS, grants, production, `main`, domains, Discord or XP were changed; no migration was applied.
