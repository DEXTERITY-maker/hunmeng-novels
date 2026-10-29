# Request intake: release blockers

Status: **not ready for production**. The schema has only been tested with fictitious PGlite fixtures. The HTTP handler is disconnected and the server write functions are not implemented.

## Schema review

1. Direct SELECT for service_role on private rights evidence was removed. The external PGlite 18.6 report confirmed the role had neither schema USAGE nor table SELECT after the change. Verify actual Supabase role inheritance and privileges separately.
2. The request constraint trigger was corrected to use new.id. The external PGlite report confirmed request insertion and update commit successfully, while an invalid conversion fails at COMMIT.
3. The PGlite report confirmed user deletion was blocked by append-only audit triggers. The current draft proposes a narrow exception for the foreign-key ON DELETE SET NULL action, preserving the pseudonymous reference and every other field. This latest proposal has not been run in PGlite or Supabase. Verify both audit tables, normal update/delete denial, attempts to clear an ID manually, rollback, and retention of all non-ID fields. Trigger nesting is not a security boundary against privileged roles able to alter database objects.
4. The creation, moderation and conversion functions, real authentication, storage and throttling are not implemented. RLS, role isolation and concurrent operations require real Supabase tests. SHA-256 requester references need a reviewed keyed derivation.

## Isolation

The connected Supabase project has no development branch; Supabase reported branch creation requires a Pro plan. A second free project could not be created because the owner's free-project quota is exhausted. No Supabase or production database changes were made. PGlite 18.6 is useful for preliminary tests but cannot establish compatibility with production PostgreSQL 17 or actual Supabase services.

Do not apply the draft or deploy the feature until the missing functions and security controls exist and the final design passes an isolated environment's tests.
