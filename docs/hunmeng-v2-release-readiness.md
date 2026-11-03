# Hunmeng 2.0 — release readiness checklist (review only)

This document describes a **proposed, not approved**, launch. Nothing in this
checklist authorizes merging, deployment, turning on the public launch flag or
changing production data.

## Scope of the staged upgrade

- Homepage and V2 launch gate: PR #132.
- Catalog and search: #134.
- Novel detail: #135.
- Chapter reader: #136.
- Personal library: #137.
- Reader profile: #138.
- News and articles: #139.
- About, contact, privacy, rights holders: #140.
- Recent chapter updates and HTTP 404: #141.
- Genres, tags, authors: #142.
- Paginated chapter contents and external source references: #143.
- Reader ranks and private writing studio: #144.
- Cross-route navigation and SEO checks: #145.
- Optional protected staff dashboard and editorial login styling: #146.
- Static-fixture-compatible footer navigation release test: #147.
- External reference author/status contrast repair: #148.
- Cross-route light/dark/system-theme contrast regression repair: #149.

Each PR is based on the preceding feature branch, **not directly on `main`**.
Review the dependencies and merge bottom-up only after the owner approves the
rollout. A standalone child PR is not independently deployable.

## Required technical gates

1. The final head of each PR must have successful **push** and
   **pull_request** build/tests, with no ignored or newly failing cases.
2. On the exact release-review commit, the dedicated
   `HUNMENG_V2_PUBLIC=1` browser suite must pass. The production build must
   **not** include fabricated demonstration books.
3. Inspect real screenshots from the release workflow for 390px and 1280px
   widths; verify no horizontal overflow at 320/390/768/1280 where specified,
   keyboard focus, legible text and functional navigation. Check the actual
   light, dark and system-dark computed foreground/background contrast on the
   homepage, catalog tags, library counts, profile (synthetic account), news,
   external source metadata and legal/contact pages. Target at least 4.5:1
   for normal text on its actual painted surface.
4. Confirm public routes have canonical metadata. `/library/`, `/account/`,
   `/studio/`, preview/admin routes and HTTP 404 must stay `noindex`.
5. The original V1 routes, local reader preferences, bookmarks, shelf data,
   optional sync and verified rewards must keep working with the public flag
   unset.
6. Check real author-source attribution, off-site `noopener noreferrer`
   links and rights-unverified notices. External novels must **not** be
   represented as Hunmeng-hosted translations before rights approval.
7. Reader account and writing studio must keep private data and auth flows
   unchanged; synthetic users are for test environments only.
8. Verify footer navigation release checks in both the browser-backed preview
   and the documented `STATIC_TEST=1` fixture mode. Use browser navigation
   rather than API requests for fixture-routed pages; the static mode does not
   start a TCP preview server.
9. A successful ordinary build with a **skipped** opt-in V2 release job is not
   evidence that the dedicated `HUNMENG_V2_PUBLIC=1` checks passed. Require
   fresh release-flag execution and human screenshot review at the exact final
   branch head before any readiness or rollout recommendation.

## Suggested manual acceptance path

Without an authenticated account: homepage → catalog → genre/tag directories
→ author/source reference → a published book → contents → a real chapter →
previous/next chapter → library → news/article → updates. Then open an unknown
URL and verify the 404 response and catalog recovery link.

For an authorized test account only, verify sign-in, library status, profile,
and original-fiction studio drafts in a **test environment**. Do not use real
user credentials or screenshots of private production accounts in CI.

## Deployment / rollback boundary

The default `HUNMENG_V2_PUBLIC` remains unset. Public canonical routes are
redirected to the editorial presentation only when an authorized deployment
explicitly enables `HUNMENG_V2_PUBLIC=1`.

Before any publication, obtain the owner's explicit approval for the
exact revision, hosting destination, flag setting and deployment procedure.
Prefer a rollback that restores the previous successful deployment or
reverts the flag to its previously tested state. Do not discard user data,
rewrite progress, or revert database migrations without a separate audited
plan. Report the deployed Git SHA and smoke-test evidence after any
explicitly authorized launch.

**Current state:** review only; no production rollout, merge, migration, or
data change is implied by this document.
