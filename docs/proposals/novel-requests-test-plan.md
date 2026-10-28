# Novel request tests — executable plan for a disposable staging database

Status: **prepared, not executed.** No database was created, no SQL was run, nothing was applied to staging or production. Running any of this requires a separate owner approval (see §1 and docs/novel-request-schema-proposal.md §12.11).

Target: a **throwaway** Supabase/Postgres database provisioned only for this test run, with synthetic data, then destroyed. The request server functions are not implemented yet; every step that depends on them is marked `BLOCKED-PENDING` and must not be reported as passed until they exist and are reviewed.

## 1. Prerequisites and controls

- Owner approval to create the disposable database; no connection to production or to the real Supabase project.
- Apply `docs/proposals/novel-requests-schema-draft.sql` in that database only, inside a reviewed transaction/session; record the exact file hash.
- Synthetic identities only: create test users in `auth.users` with `@fixture.test` emails (or a local auth schema equivalent). No real user data, no production secrets.
- The whole run starts from a snapshot and ends by destroying the database. Each scenario runs in `BEGIN … ROLLBACK` unless it explicitly tests commit-time constraints.
- The prepared test plan is a plan, not evidence. A scenario is "passed" only if it was actually executed in the approved environment and its output was recorded.

### 1.1 Simulating sessions

```sql
-- Run as the database owner once per simulated session:
-- requester identity comes from auth.uid() -> request.jwt.claims
select set_config('request.jwt.claims',
  json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, false);
set role authenticated;
```

- `anon` session: `set role anon;` with empty claims.
- `service_role` session: `set role service_role;`
- editor/admin: same authenticated session, plus a row in `novel_staff` created by the database owner.
- Reset: `reset role; reset request.jwt.claims;`

## 2. Scenario matrix

Legend: **DB** — enforced by constraints/indexes/triggers in the candidate; **FN** — depends on a not-yet-implemented server function; **GUARD** — enforced by existing `novel_guard_job`/`novel_guard_source` (outside the request tables). Expected values marked *pending* are not verified yet.

### S1. Access matrix (anon, requester, other user, editor, admin, service_role)

Setup: owner creates users U1 (requester), U2 (other user), E (novel_staff editor), A (novel_staff admin); one synthetic request R1 owned by U1 (inserted by the owner for this test, because `request_create` is not implemented yet). Then:

| # | Actor | Action | Expected | Source |
| --- | --- | --- | --- | --- |
| 1.1 | anon | `select * from public.request_owner_view` | 0 rows / permission denied (no grant) | DB |
| 1.2 | anon | `select * from public.novel_requests` | permission denied | DB |
| 1.3 | anon | `insert into public.novel_requests ...` | permission denied | DB |
| 1.4 | U1 | `select * from public.request_owner_view` | exactly R1 | DB |
| 1.5 | U1 | `select * from public.novel_requests` | permission denied (no base grant) | DB |
| 1.6 | U1 | `update public.request_drafts set request_blocked=false` | permission denied | DB |
| 1.7 | U2 | `select * from public.request_owner_view` | 0 rows | DB |
| 1.8 | E | `select * from public.request_staff_view` | sees R1 | DB |
| 1.9 | E | `select * from public.request_owner_view` | sees only own requests (none) | DB |
| 1.10 | E | direct `update public.novel_requests set status='draft'` | permission denied | DB |
| 1.11 | A | `select * from public.request_staff_view` | sees R1 | DB |
| 1.12 | A | direct `update public.request_moderation_decisions ...` | permission denied; trigger raises if reached | DB |
| 1.13 | service_role | `select * from public.novel_requests` | allowed | DB |
| 1.14 | service_role | `insert/update/delete` on request or audit tables | permission denied | DB |
| 1.15 | owner role | `delete from public.request_moderation_decisions` | trigger raises (documented exception: owner can disable triggers with DDL) | DB/exception |

`BLOCKED-PENDING`: 1.4/1.8 assume owner-inserted fixtures; when `request_create` exists, replace fixtures with real calls and add `anon/authenticated` EXECUTE checks on the function.

### S2. Idempotency-Key: same body vs different body

`BLOCKED-PENDING` (`request_create` not implemented). Plan:

1. As U1 call `request_create(url=X, note='n', idempotency_key='k-1', hints=H1)` → one request, fingerprint F1, `201`.
2. Repeat identical call → same request id, no new row, fingerprint F1, `deduplicated='replay'`.
3. Call with `k-1` and different hints/URL → `409 idempotency-key-reused`; original row unchanged (compare `updated_at`, `fingerprint`, `version`).
4. Call with `k-2` and same URL while the first is open → `deduplicated='active-request'`, no second row (partial unique index).
5. Call with `k-3`, same URL, after the first reaches `rejected` → new allowed row (index is partial).

DB-level checks that can be tested today without functions:

```sql
-- unique idempotency per requester_ref
insert into public.novel_requests (requester_ref, submitted_url, external_source_id, idempotency_key, request_fingerprint)
values (repeat('a',64), 'https://fiction-archive.test/work/1', '<src>', 'k-1', repeat('b',64));
-- second insert with same (requester_ref, 'k-1') must fail: unique_violation (DB)
```
`BLOCKED-PENDING`: actual 409/fingerprint comparison is server logic.

### S3. Concurrent submissions and two moderators

Concurrency needs two real sessions. Options: two `psql` terminals, or `dblink`/`pg_background` if available; no test is run here.

- **S3.1 simultaneous submissions:** two sessions call `request_create` for the same user+source at the same time → one row, the other returns replay/active-request; no unique_violation leaks to the user. `BLOCKED-PENDING`.
- **S3.2 two moderators, same request:** both read `version=3`. Session 1: `request_decide(R, 'review', 'reason', 3)` → commit → version 4. Session 2: `request_decide(R, 'draft', 'reason', 3)` → `409` with current version 4 and winning decision; no second decision row, no lost update. `BLOCKED-PENDING`.
- **S3.3 two moderators, different requests, same work/source:** both convert to the same `novel_sources`; the second must reuse the work link (no duplicate `novel_sources`, no unique violation), or receive a clear conflict if the work already points to another source. `BLOCKED-PENDING` (`request_convert`), DB constraints already tested separately in S4.

### S4. Several requests for one source, no duplicate work / novel_sources

DB-level checks that can run once fixtures exist (owner inserts rows; no functions needed):

```sql
begin;
-- one external source row
insert into public.request_external_sources (provider, external_id, canonical_url, host, work_id)
values ('fixture', '4242', 'https://fiction-archive.test/work/4242', 'fiction-archive.test', '<work>');
-- two requests by different requesters share the same external_source_id: must succeed
insert into public.novel_requests (...) values (...) -- requester_ref r1
insert into public.novel_requests (...) values (...) -- requester_ref r2, same source
-- two drafts converted to the same existing novel_sources link: must succeed (no unique index on converted_source_id)
-- (draft rows require a request each; conversion function is BLOCKED-PENDING,
--  but the absence of the unique index can be verified by schema inspection)
select count(*) from pg_indexes where indexname = 'request_drafts_one_source';
-- expected: 0 rows (the index was removed on purpose)
rollback;
```

Expected: multiple requests map to one external source and one work; no new `novel_sources` row is required. The unique partial index `request_works_one_source` must still reject a second work pointing to the same `novel_sources`:

```sql
-- expected: unique_violation (DB)
update public.request_works set novel_source_id = '<same-source>' where id = '<second-work>';
```

### S5. Transaction abort and link integrity

```sql
begin;
-- create a request/work/source fixture, then try to set work.novel_source_id
-- without updating request.status or draft link; the deferred constraint trigger
-- must raise at commit and abort the whole transaction.
update public.request_works set state='converted', novel_source_id='<src>' where id='<work>';
-- request.status remains 'submitted' in this transaction
commit;  -- expected: exception, transaction rolled back
rollback;
```

Also check: after an intentional abort, no partial rows remain (`select count(*)` equals the pre-transaction snapshot).

`BLOCKED-PENDING`: conversion through the function must be checked separately (function not implemented).

### S6. Private rights evidence is unreachable

```sql
-- as anon, authenticated requester and service_role:
select * from private.request_rights_evidence;          -- expected: permission denied for all
select * from public.request_owner_view;                 -- must not expose evidence columns/text
select * from public.request_staff_view;                 -- must not expose evidence text
-- verify column list of both views does not contain evidence_text
select column_name from information_schema.columns
 where table_schema='public' and table_name like 'request_%_view'; -- no evidence_text
```

`BLOCKED-PENDING`: admin-only definer function to read evidence (not implemented); once it exists, test that editor gets denied, admin gets allowed, and each read is audited.

### S7. Rights revoked or expired → publication blocked

Depends on the existing editorial pipeline (available in staging with `novel_guard_job`/`novel_guard_source` from `backend/*.sql`):

1. Create `novel_sources` with `rights_status='verified'` (as admin, through the existing guard) and a job in `approved`; verify `novel_guard_job` accepts.
2. Set `novel_sources.rights_status='revoked'` or `rights_valid_until = current_date - 1`; attempt approval/review transition → expected: exception "Publication rights not verified" (`GUARD`, existing).
3. Check the request projections: `source_rights_status` / `source_rights_valid_until` reflect the change without any request-side update (DB views read the authoritative row).
4. Confirm `publish-approved.mjs` would refuse the job (its `rightsOK` check) — `GUARD`, can be verified by unit test/mocking, not by running production publish.

### S8. History protection and documented exceptions

```sql
-- normal roles: rejected/denied
update public.request_moderation_decisions set reason='tampered' where id = '<id>';  -- denied or trigger raises
delete from public.request_match_evidence where id = '<id>';                        -- trigger raises
delete from private.request_rights_evidence where id = '<id>';                      -- denied/raises
```

Documented exceptions to record in the report:

- table owner can `ALTER TABLE ... DISABLE TRIGGER` and then change rows; superuser bypasses everything;
- `service_role` has SELECT only in this candidate;
- therefore "append-only" means "not changeable through ordinary application SQL", not cryptographic immutability. If privileged-role tampering is in scope, add an external audit trail (WAL/log shipping, hash anchoring) — out of scope here.

## 3. What must be implemented before scenarios can run

| Dependency | Needed for | Status |
| --- | --- | --- |
| `private.request_create` (+ public wrapper, EXECUTE grants) | S2, S3.1 | not implemented |
| `private.request_decide` | S3.2, draft creation | not implemented |
| `private.request_convert` | S3.3, S5 conversion checks | not implemented |
| `private.request_document_rights` | S6 admin evidence read, S7 documentation | not implemented |
| dedicated `request_owner` role or final view model | all view/EXECUTE tests | owner decision pending |
| `auth.users` fixtures + JWT claim helper | all sessions | environment design pending |
| concurrency harness (two sessions or dblink) | S3 | environment design pending |

Steps S1 (mostly), S4, S5 (partly), S6 (negative access), S7 (guards) and S8 can be executed as soon as the candidate SQL is applied to a disposable database, but **none of them has been executed yet**.

## 4. Reporting format for the future run

For each scenario: id, actor, SQL block, expected, actual, pass/fail, environment hash (SQL file sha256, database id), timestamp, and any deviation. Any scenario depending on an unimplemented function must be reported as `pending implementation`, never as passed. The final report must state that no result was produced by static review alone.

## 5. Explicit non-claims

- No test in this document has been executed.
- No database, RLS policy, grant, publication or production system was touched.
- Static document/SQL consistency checks do not prove SQL correctness or RLS security.
