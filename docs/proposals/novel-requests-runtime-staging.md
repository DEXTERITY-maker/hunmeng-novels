# Isolated server composition (29 October 2026)

**Not deployed.** No route, secret, schema migration, database user, Cloudflare Function, Supabase project or production setting was created by this patch.

## Current components

- `src/lib/novel-requests/server-supabase-auth.ts`: constructs a **server-only**, non-persisting Supabase Auth SDK client using a **publishable** key; identity comes from `auth.getUser(jwt)`, never user-editable JWT metadata. No service-role or database secret is needed for Auth.
- `src/lib/novel-requests/isolated-runtime.ts`: composes this verifier with the keyed requester reference, disconnected HTTP handler and PostgreSQL query-executor contract. It does not export a route and it does not create a database connection.
- The existing `postgres-store.ts` **rejects nonempty source metadata or duplicate-match evidence** because the SQL prototype does not persist them. This is intentional fail-closed behavior, not feature completeness.

## Before enabling a real POST endpoint

1. **Staging environment.** Create a separate throwaway database/project with independently generated secrets, using the owner's explicit approval. Do not run the draft against the shared production Supabase project. A test of `getUser` with real staging JWTs (valid, expired, revoked, wrong project, deleted, banned) is required.
2. **Least-privilege SQL executor.** Design a dedicated server-only PostgreSQL role and transaction/pooler connection appropriate for Cloudflare Pages/Workers. Do not put `PGPASSWORD`, `DATABASE_URL`, HMAC material, or Supabase secret/service-role key in browser bundles or Git. The current private SQL function does not grant EXECUTE to `service_role` by design. Do not use an unrestricted privileged user as a shortcut.
3. **Match evidence.** Persist adapter metadata, match candidates and provenance in one transaction with the request and the idempotency record. Freeze the source adapter policy revision. Do not silently discard this information. No automatic merging of works based on titles/chapters.
4. **Abuse controls.** Enforce trusted edge-origin IP derivation (no attacker-controlled forwarding headers), durable per-user and per-IP rate limits, bounded concurrent bodies and logging/retention policies. Current prototype includes an atomic per-user creation quota; that does not replace edge throttling.
5. **RLS, views and grants.** Test `anon`, `authenticated`, `service_role`, editors, dedicated writer and table-owner privileges against real Supabase. Review the two `security_invoker=false` views carefully: they must be proven isolated for each role, not assumed from ordinary RLS. Get fresh `auth.uid()` in every policy where needed.
6. **Source rights, SSRF, moderation.** Use explicit allowlisted source adapters with allowed URL patterns, no arbitrary server fetch, confirmed publishing rights, human decisions for uncertain duplicates, append-only audit and a rollback plan.
7. **Release coordination.** PR #62 (pure source/matching base) must be reviewed first. PR #66 is based on #62. PR #68 provides a disconnected responsive UI preview and is independent of backend routing; the full form must be integrated only after #62/#66 and all checks above. Do not retarget PR #66 directly to `main` without preserving its dependency changes and reviewing the aggregate diff.

Reference: `docs/proposals/novel-requests-release-blockers.md`, `docs/proposals/novel-requests-identity-storage-bridge.md`.

No production write has been performed.
