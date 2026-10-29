# Request intake: release blockers

Status: **not ready for production**. Initial draft was executed locally in PGlite with test-only stubs. No Supabase or production database changes were made. The subsequent fixes have not yet been executed in PGlite. The planned HTTP handler remains disconnected. GitHub PR #66 extends PR #62.

## Schema review findings

1. Local PGlite testing confirmed that the original draft directly granted `service_role` SELECT on `private.request_rights_evidence`. The proposed revision removes that grant. Verify effective privileges on a disposable database, including role inheritance and owner/bypass-RLS behavior. A role with sufficiently privileged database access remains outside the protection boundary.
2. The request integrity trigger incorrectly referenced `new.request_id` on `novel_requests`. The proposed revision uses `new.id`, but needs execution and deferred-transaction tests.\n3. `actor_id` and `stored_by` refer to `auth.users` with `ON DELETE SET NULL`, while append-only triggers reject every update to their respective audit tables. A user deletion can therefore conflict with the trigger's unconditional rejection. Define the retention and authorized deletion behavior, implement the narrowest intended exception or change the data model, and verify both deletion and attempted tampering with real role tests. Do not assume the current draft safely supports account deletion.
4. The write-side creation, moderation and conversion functions are not implemented. The candidate cannot receive requests even if its DDL succeeds. RLS, projections and identity checks require end-to-end role and concurrency tests before release. The requester SHA-256 reference also needs the reviewed keyed derivation described in the handler proposal.

## Isolation and verification

On 2026-10-29 the connected Supabase project reported no development branches. Creating a branch returned `Branching is supported only on the Pro plan or above`; no branch was created. An isolated PostgreSQL/Supabase environment is still required; don't execute this draft against the production database for testing. Review potential cost and permissions before creating a separate project.

The original schema executed in PGlite 18.6 with test stubs; a normal request insert failed with SQLSTATE 42703 before later role/deletion tests could complete. The production database runs PostgreSQL 17, so PGlite testing does not establish compatibility. The prior local `node --test tests/*.test.mjs` passed 93 tests and `npm run build` completed; neither result verifies PostgreSQL, RLS, real authentication or concurrent database behavior.

Do not deploy or apply the draft until these issues are addressed, the missing server paths exist, database tests pass in isolation, and the final production change is reviewed against the owner's authorization.
