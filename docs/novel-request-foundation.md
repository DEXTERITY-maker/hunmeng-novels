# Novel request foundation (draft, not enabled)

This branch adds a pure TypeScript foundation, not a deployed request system. It does not create tables, change RLS, send requests, fetch external URLs, publish, copy text or images, or change XP. Existing `novel_sources`, `novel_translation_jobs`, publication guards and static content remain authoritative.

## What works now

`src/lib/novel-requests/core.ts` identifies URLs through explicitly supplied adapters, compares a bounded set of candidate works with explanations, selects permitted metadata already supplied by an adapter, validates moderation transitions and provides an advisory rights check. No real source adapter is enabled; the adapter in the tests is a fixture. Same provider and external ID are an exact identity signal; matching names and authors or three distinctive numbered chapter titles are probable matches, never an automatic merge. Normalization and chapter titles can have false positives and miss translations or renumbered chapters. Covers are intentionally not used as identity. The function scans its input; it is not a production-wide search index.

## Integration before launch

1. Inventory existing deployed schema and roles in a separate staging project. Design additive request, canonical work, alias, external source, match evidence and append-only moderation decision records, explicitly linking to existing `novel_sources` and published slugs rather than duplicating their editorial/reader data. Preserve existing URLs and data. No migration is included here.
2. Build an authenticated server-side submission endpoint with per-user and per-IP limits, idempotency, size limits and transactional unique source identifiers. Define ownership and moderator roles and review new RLS policies separately; do not rely on browser checks. Do not deploy or change production/RLS without owner approval.
3. Add source adapters only after verifying metadata access permissions and documenting source-specific policy, robots/terms and provenance. Use an exact host and path allowlist, DNS/IP and redirect validation on every hop, timeouts, response limits and egress controls to prevent SSRF. No arbitrary URL fetching, paywall bypass, chapter bodies or cover downloads. No adapters are approved by this branch.
4. Index normalized aliases, author identities and provider/external IDs in Postgres; use bounded candidate retrieval and versioned matching signals. Include multilingual aliases and source chapter structure where permitted. Protect against races with transactional constraints. Human review resolves ambiguous matches and records explanations and reversals. Chapter counts or generic chapter numbers alone prove nothing; different translations and editions need further review.
5. Add request status/history for the requester and an accessible moderation queue with filters, pagination, explanations, links to the existing source and draft/rights screens. Never expose private rights evidence to requesters. Audit actor, decision and time server-side, and use optimistic concurrency for competing moderators.
6. Publication must still pass the current server-side rights and QA guards, including revocation/expiration checks at publication time. A URL, metadata permission, or generated image is not evidence of translation or publication rights. `canPreparePublication` is advisory only and must never replace DB enforcement.
7. For future change detection, store only permitted source IDs, last checked time, version/cursor and chapter metadata, with bounded retries, rate limits and an audit. A detected chapter creates a review candidate, not a published chapter.
8. For AI images, introduce separate asset requests, provenance, rights and review states, private previews and explicit human approval before use. Do not import external covers or publish generated assets automatically; no image provider, storage, keys or UI is connected here.

## UI observations (28 October 2026)

WTR-Lab's request page exposes URL examples, supported sites, usage limits and recent request statuses. Hunmeng's public home offers catalog search but no visible request entry point; `/admin/` shows an access-denied state without editorial sign-in. The existing source form asks staff to enter a slug, title, description, genres and URL before rights are verified, so a guided request review could reduce manual re-entry and show duplicate evidence and rights state before a source is created. Authenticated workspace visual behavior was not inspected.

## Verification

Run `node --test tests/novel-requests.test.mjs` on Node 24. Existing project CI also runs `node --test tests/*.test.mjs`. This does not test database authorization, network security, a user interface or production integration; none is implemented in this branch.
