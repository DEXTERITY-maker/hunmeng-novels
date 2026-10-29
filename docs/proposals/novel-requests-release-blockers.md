# Request intake: release blockers

Status: **not ready for production**. Static review only; no SQL execution or database changes were made. The planned HTTP handler remains disconnected. GitHub PR #66 extends PR #62.

## Schema review findings

1. `private.request_rights_evidence` is explicitly granted `SELECT` to `service_role` in the draft. The documented model says access is to be mediated by an audited admin-only function. This direct grant contradicts that model. Remove or explicitly redesign the privilege and verify effective privileges on a disposable database, including role inheritance and owner/bypass-RLS behavior. A role with sufficiently privileged database access remains outside the protection boundary.
2. `actor_id` and `stored_by` refer to `auth.users` with `ON DELETE SET NULL`, while append-only triggers reject every update to their respective audit tables. A user deletion can therefore conflict with the trigger's unconditional rejection. Define the retention and authorized deletion behavior, implement the narrowest intended exception or change the data model, and verify both deletion and attempted tampering with real role tests. Do not assume the current draft safely supports account deletion.
3. The write-side creation, moderation and conversion functions are not implemented. The candidate cannot receive requests even if its DDL succeeds. RLS, projections and identity checks require end-to-end role and concurrency tests before release. The requester SHA-256 reference also needs the reviewed keyed derivation described in the handler proposal.

## Isolation and verification

On 2026-10-29 the connected Supabase project reported no development branches. Creating a branch returned `Branching is supported only on the Pro plan or above`; no branch was created. An isolated PostgreSQL/Supabase environment is still required; don't execute this draft against the production database for testing. Review potential cost and permissions before creating a separate project.

GitHub checks for the earlier HTTP commit were still in progress at the time of this review. The prior local `node --test tests/*.test.mjs` passed 93 tests and `npm run build` completed; neither result verifies PostgreSQL, RLS, real authentication or concurrent database behavior.

Do not deploy or apply the draft until these issues are addressed, the missing server paths exist, database tests pass in isolation, and the final production change is reviewed against the owner's authorization.
