# Novel request server handler (isolated, not connected)

Status: **implemented and tested in isolation; not wired to any route, database, Supabase project or source.** No production, no staging, no network. PR #62, draft.

Files:

- `src/lib/novel-requests/handler.ts` — handler + injected interfaces.
- `tests/novel-request-handler.test.mjs` — 16 tests with in-test doubles (16/16 pass in this commit).
- Related design: `docs/novel-request-schema-proposal.md` (storage, RLS, server contract), `docs/proposals/novel-requests-schema-draft.sql` (SQL candidate), `docs/proposals/novel-requests-test-plan.md` (future staging tests).

## 1. What the handler does

`handleNovelRequest(input, dependencies)` implements one submission flow:

1. **Identity** — `dependencies.identity.verify(token)`. Missing verifier, a throwing verifier or any unconfigured dependency → `503 dependency-unavailable` (fail closed). `null` actor → `401`; inactive account → `403`.
2. **Input validation** — body must be a JSON object with exactly `url`, `note`, `idempotencyKey`, `clientHints`. Unknown fields are rejected with `400 unexpected-field`, so a client cannot set `requesterId`, `role`, `status`, `rights`, `matches`, `fingerprint`, `published`, etc. URL length, note length, key length, hints schema and payload size are bounded.
3. **HTTP request throttling** — `submit:user:<requesterRef>` and, when the transport supplies a hashed IP, `submit:ip:<hash>`. Denied → `429 rate-limited` with `retryAfterSeconds`; limiter unavailable → `503`.
4. **Source recognition** — only through `dependencies.sources.recognize(url)` (an explicit registry). `null` → `400 unsupported-url`; registry failure → `503`. No adapter that performs network I/O is shipped.
5. **Fingerprint** — server-side SHA-256 over canonical URL, provider, external id, note and validated hints. The client never supplies or overrides it.
6. **Idempotency** — same `(requesterRef, idempotencyKey)` and same fingerprint → `200 replay` with the original request id; same key with different content → `409 idempotency-key-reused` and the original is untouched; an already-open request for the same source → `200 active-request`.
7. **Advisory matching** — only adapter metadata (never client hints) is compared with a read-only catalog. Matches are advisory; nothing merges.
8. **Persistence contract** — `store.submitAtomically(...)` must check key and fingerprint, active-source uniqueness, and consume the creation quota only for a new record, in one transaction. It returns new/replay/active-request/conflict/quota-exceeded. The separate HTTP limiter applies to all attempts, including replays, so an abuse limit may still return 429. The in-memory double cannot prove database atomicity.
9. **Response projection** — `{requestId, status:'submitted', deduplicated, matches, rights:'unverified', algorithmVersion, provisional:true}`. No tokens, user ids, requester refs, fingerprints, hints, adapter metadata, IP hashes or other users' data are returned.

Dependencies are explicit interfaces: `IdentityVerifier`, `SourceRegistry`, `CatalogReader`, `RateLimiter`, `RequestStore`. The handler contains no test doubles, no Supabase client, no `fetch`, and no chapter or cover import.

## 2. Failure matrix (tested)

| Situation | Result |
| --- | --- |
| identity/sources/catalog/rateLimiter/store not configured | `503 dependency-unavailable` |
| verifier throws (backend down) | `503 dependency-unavailable` |
| no token / unknown session | `401 unauthenticated` |
| inactive account | `403 inactive-account` |
| malformed body, bad URL shape, oversized payload | `400 invalid-body` / `payload-too-large` |
| unsupported host/path (no adapter) | `400 unsupported-url` |
| client tries to set server-owned fields | `400 unexpected-field` |
| rate limit hit (user or IP bucket) | `429 rate-limited` + retry-after |
| same key, same content | `200 replay` (same id) |
| same key, different content | `409 idempotency-key-reused` |
| open request for same source | `200 active-request` |
| store read/write failure | `503 storage-unavailable` |

The tests use an in-memory store, in-memory limiter, a fixture identity map and the fictional `.test` adapter from the prototype. Those doubles only prove handler control flow; they are **not** authentication, authorization, rate-limit or storage security.

## 3. What is deliberately missing

- No HTTP route and no public UI. `src/lib/novel-requests/handler.ts` is not imported by any page or endpoint.
- No real identity verification (Supabase JWT / session), no roles lookup, no CSRF/size-limit middleware.
- No real rate limiter (edge/Redis/DB counter) — only the interface.
- No database access, transactions, RLS, unique constraints or audit tables — those exist only as the reviewed SQL candidate, not applied.
- No source adapters and no network requests; the prototype adapter remains a fixture in `prototype-fixtures.ts`.
- No chapter text, descriptions, covers or images are fetched, stored or returned.
- No matching against a real catalog; advisory matching uses the tiny fictional catalog.
- Decisions, drafts, conversion and rights handling stay in the schema proposal; the handler stops at `submitted`.

## 4. Current Astro build mode and what a real route needs

`astro.config.mjs` uses `output: 'static'` and **no SSR adapter**; `astro check` + `astro build` produce static HTML only. There is no server runtime in this project today, so the handler cannot be reached by a request.

A real server route would require a separate, owner-approved step:

1. Add an SSR adapter for the target runtime (e.g. `@astrojs/node` for a long-lived server, or the Cloudflare adapter for Pages Functions/Workers) and switch `output` to `server` or `hybrid` (or keep static pages and add one server endpoint).
2. Create `src/pages/api/novel-requests.ts` with `export const prerender = false` (or the adapter's equivalent), method check (`POST` only), body size limit, `Content-Type` validation and CSRF/Origin checks.
3. Wire the dependencies: verified Supabase session → `IdentityVerifier`; server-only Supabase client → transactional `RequestStore`; an edge/DB rate limiter; an adapter registry with zero enabled adapters in the first iteration.
4. Keep the handler server-only: it must not be imported into client components or bundled to the browser; secrets and service-role access stay on the server.
5. Deploy to a separate staging target first; production route, database and secrets addition require explicit owner approval.
6. Edge vs Node: the handler uses Web Crypto (`crypto.subtle`), available in both, but storage/limiter bindings differ; the real store must be chosen per runtime.

Until those steps are done and the staging tests in `docs/proposals/novel-requests-test-plan.md` pass, the request intake is **not** available to users and must not be advertised as working.

## 5. Non-claims

- The in-memory store does not prove atomicity, idempotency or uniqueness of a real database; only the SQL candidate executed in a disposable staging database can.
- The fixture identity map is not authentication; the fixture limiter is not rate limiting; the fixture catalog is not a catalog.
- No RLS policy, grant, migration, route, production system, domain, Discord, XP or site page was changed in this step.

## Security boundaries added in this revision

The registry output is checked against independently supplied trusted URL adapters, including source identity and canonical URL. Rules and registry implementations remain test fixtures; no external source is enabled. A normalized requester reference currently uses SHA-256 of a user ID: it is pseudonymous, potentially correlatable and not anonymous. Before deployment, use a reviewed server-managed keyed derivation (e.g. HMAC) with key rotation and retention policy; no key is included here. `note` is persisted but is excluded from response projections. A real transactional implementation must check idempotency before charging the creation quota and enforce both atomically. Request throttling is separate and may limit replay traffic.
