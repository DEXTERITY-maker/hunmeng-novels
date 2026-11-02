# Hunmeng 2.0 — release-candidate gate

**Status: NOT READY FOR PRODUCTION.** This file is the review checklist for PR #130, not a release declaration, permission to merge, or an automatic deploy instruction. The existing public release remains 0.7.0 until a separately reviewed promotion.

## Scope in the current prototype

| Area | Preview route | Existing canonical route | Acceptance |
| --- | --- | --- | --- |
| Reading room / homepage | `/v2/` | `/` | Authentic library/news, mobile 320–1280px, search and featured reading |
| Catalog / discovery | `/v2/catalog/` | `/catalog/` | Existing filter query contract, source labels, V2-only description search, no cross-source chapter imports |
| Reader | `/v2/read/:slug/:chapter/` | `/novel/:slug/:chapter/` | Published local chapters only, canonical V1 links, existing settings/shelves/progress, keyboard and focus mode |
| Editorial command center | `/v2/admin/` | `/admin/` | Same tab-only staff session, RLS/rights gate, editor/admin separation, revoke/logout clearing, no implicit publish |

V2 is a **pilot**, not a complete replacement for the existing product: the novel detail page, account/profile, library, tags/genres, published external catalogs and writing studio still use V1 routes. Do not claim those areas have been redesigned.

## Hard gates before any merge, deployment, version bump or announcement

- [ ] Both **push** and **pull_request** checks pass on the **same final HEAD commit**. Older green checks do not count.
- [ ] Node tests, static production build, serial Playwright, demo build and full desktop/mobile Playwright pass.
- [ ] No unexpected warnings in dependency audits; any remaining vulnerabilities are documented and assessed, not hidden by suppressing tests.
- [ ] Four V2 areas tested as one flow. Both existing V1 homepage and catalog retain old URLs and behavior.
- [ ] Every V2 route is `noindex,follow` and excluded from the sitemap. Private editorial responses use `no-referrer`.
- [ ] Unauthorized visitor receives **no editorial data**. Reader and editor credentials remain in different stores; staff role changes hide the workspace and remove data from the DOM. RLS remains the actual access boundary.
- [ ] Chapter URL/slug and progress/bookmark keys remain unchanged. Confirm no double award/duplicate server receipts from preview navigation.
- [ ] Only already-published and authorized local chapters appear in the V2 reader. No scheduled/remote guarded chapter route is copied into the preview.
- [ ] Test accessibility: keyboard navigation, visible focus, dialog return focus, contrast, reduced motion, themes and font settings.
- [ ] Visual screenshots approved at 320, 390, 768, 1280/1440 px, in both desktop and mobile Chromium. Check dark and sepia, slow image fallback, cards with long titles and tall chapter content.
- [ ] Review source rights, external listing labels and metadata attribution; do not change license or publish permissions just to satisfy visual content.
- [ ] Confirm the public `main` and Cloudflare production revision at deployment time, plus independent rollback steps.
- [ ] Obtain a separate explicit decision to merge and launch. A passing CI run is not launch authorization.

## Safe preview procedure

1. Use PR #130, branch `feat/hunmeng-2-foundation`, to inspect the exact source and CI logs.
2. Use local `npm ci && npm run build:demo && npm test` for the synthetic content tests; keep demo-only assets out of production.
3. Build production with `npm run build` and verify generated `dist/sitemap-0.xml` excludes `/v2/`.
4. Review the four V2 routes in an isolated test build. Do not upload that build to the production Cloudflare Pages project.
5. Capture design sign-off and record tested commit SHA and reviewer conclusions in this checklist before moving to a release PR.

## Promotion plan — separate PR, not part of the pilot

- Replace public `/` and `/catalog/` in a controlled feature-flag or URL-level switch while keeping the old implementation available for rollback.
- Preserve reader and admin canonical paths. Reuse proven shared logic; do not create a second set of credentials, bookmarks or RLS policies.
- Update SEO canonical tags and sitemap **when** routes actually become public; remove pilot-only `noindex` only from the routes intentionally launched. Do not index private admin pages.
- Add dated English `category: changelog` news **in the same PR as user-visible launch changes**, with only verified features.
- Review and approve a semantic version (proposed `v2.0.0`) only after the whole release scope is settled. Do not rename current `0.7.0` just to make the prototype look launched.
- Deploy exclusively via the existing approved-revision Cloudflare workflow. Record the exact deployment SHA, check the public site, and create a GitHub release/tag only after success.
- Rollback: restore the previously verified deployment through the same reviewed workflow, preserving the same data, RLS, progress storage and API contracts. Never run destructive SQL as a website rollback.

## Explicitly excluded from this design iteration

- Supabase schema migrations or service-role/browser credentials
- Telegram webhook enablement, notification state changes, bulk chapter publishing
- Import of third-party full chapters without rights evidence
- Changes to achievements, XP receipts, user identities or profile databases
- Production deployment, live releases and marketing claims

As of creation, release qualification is **pending**: CI on the current branch must be verified on the latest SHA, design acceptance is not recorded, and no production promotion has occurred.
