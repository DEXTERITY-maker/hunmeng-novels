# Hunmeng 2.0 — architecture and phased rebuild

Status: **four-stage V2 preview implemented in PR #130; CI, design review and production promotion are separate gates.** This is not a production release. Review [release-candidate checklist](./hunmeng-2-release-candidate.md) before any launch.

## Product goals

1. **Visual system:** a cohesive editorial interface with calmer navigation, strong typography, authentic book art, responsive cards, clear focus states, and reduced-motion support.
2. **Discovery:** reliable search by title, author and eventually description, normalized genres/tags, transparent external-source labeling, sorting, and recommendations derived from real content only.
3. **Reader:** preserve canonical chapter URLs and browser/cloud storage keys while improving typography, themes, chapter switching, progress, accessibility, and offline-error handling.
4. **Editorial/admin:** simplify the existing staff workflow around rights verification, chapter import, staged review, publishing, release diagnostics, and role-based access. No public import of unlicensed content.

## Stage 1: isolated homepage pilot (this PR)

- New `/v2/` landing page uses `getLibrary()`, `getLatestChapters()`, `getNews()` and rights-safe `unpublishedExternalEntries()` directly. It contains no invented books or live ranking data.
- Search submits to the isolated `/v2/catalog/` preview with the same tested filter contract; the original `/catalog/` route remains unchanged.
- Book cards and chapters link to the existing, canonical reader routes; external references remain labeled and link only to their existing metadata pages.
- Reuse `Layout.astro` and its session, appearance, storage, security headers, account navigation and footer. No duplicate auth or storage implementation.
- V2 selectors live in `src/styles/v2-home.css`. Do not append generic overrides to the existing large stylesheets or change V1 components.
- Pilot is `noindex` and omitted from the sitemap; nothing on the live homepage links to it. It must not be used as a marketing announcement.
- Tests cover published fixtures, search, keyboard reachability, viewport overflow, reduced-motion and V1 compatibility.

## Stage 2 pilot: independent discovery route (in progress)

- The prototype catalog is at `/v2/catalog/`, with a V2-specific visual layer and **the same existing filter form, tags, sorting, pagination, HTML escaping and source labeling** as `/catalog/`.
- V2 text search additionally matches local descriptions, genres and categories. It still searches the already permitted metadata index only; this is not external full-text ingestion or semantic ranking.
- The V2 homepage now links to the V2 discovery route; published novel/chapter URLs and protected reader data remain canonical.
- Legacy catalog behavior remains unchanged. Both prototype routes are noindexed and excluded from the sitemap.
- Test the V2 metadata search and URL query restoration on desktop/mobile before promoting any V2 changes to public navigation.

## Stage 2: catalog and search

- Replace presentation incrementally, keeping the `/catalog/` URL/query parameter contract.
- Extract reusable design tokens, cards, filters and paging components shared across V2 pages.
- Improve title/author/description discovery against the existing published catalog and explicitly labeled source references. Build or verify the search index before enabling new match behavior.
- Preserve `include`, `exclude`, `tagMode`, `genre`, sort, and other supported filter inputs. Do not merge external metadata into published chapters or reader rewards.
- Add empty/loading/error/keyboard and small-screen tests. Validate performance against the actual catalog size.

## Stage 3: reading experience

- Redesign chapter navigation and reading controls incrementally around `ReaderView.astro`.
- Preserve `/novel/:slug/:chapter/`, localStorage keys, persisted reading records, chapter receipts and account/profile identifiers. Changes to storage schema require a migration and rollback test.
- Never infer release rights from external catalog listings; RLS and editorial checks remain authoritative.
- Test light/dark/sepia, zoom, reduced motion, screen-reader landmarks, 320px layouts, chapter links, bookmarks, and local/cloud-progress conflicts.

## Stage 3 pilot: isolated, shared-engine reader

- Existing chapter pages `/novel/:slug/:chapter/` continue unchanged. A separate `/v2/read/:slug/:chapter/` route renders **already published local** chapter content only.
- The V2 route uses the existing `ReaderView`, `initReader`, paragraph bookmarks, reading settings, current shelf/progress keys and the same reward guards. No schema migration or new API integration is introduced.
- V2 chapter navigation stays in the preview for adjacent published chapters; links to the novel detail and original reader remain canonical.
- Prototype pages are `noindex` and excluded from the sitemap. The existing `reader-page` and V1 class rules are unaffected.
- V2 uses a scoped `body.v2-reader` visual layer. Styling must respect light/dark/sepia and must not override the reader's per-book font size, spacing or width preferences.
- Scheduled remote chapters remain exclusively on existing guarded canonical routes. Do not generate V2 scheduled shells or bypass their release checks.
- Verify actual chapter content, V2 next/previous navigation, cross-view local progress, settings, bookmarks, keyboard controls and 320px overflow in demo browser tests.

## Stage 4: staff/admin

- Audit current admin tasks and simplify information architecture before changing authorization.
- Keep roles, RLS, publication approvals, rights-gated import, source provenance and chapter review exactly as strict as in production.
- All dangerous operations (publish, bulk import, Telegram send, migrations) stay behind explicit reviewed actions.
- Verify with staff role tests and denied-access tests; never use a Supabase service credential in a public browser.

## Stage 4 pilot: existing-role editorial command center

- New independent `/v2/admin/` interface presents sources and rights, terminology, chapter drafts, licensed batch import, the review and publication queue, and administrator-only review moderation as one clearly navigated workflow. The command center now shows a read-only count summary for the already fetched source list and the most recent 100 jobs, plus a client-only workflow-state filter.
- The route reuses **the existing `initAdmin()` and `initAdminReviews()` modules**, forms, field names, DOM IDs, Supabase RLS and staff permissions. V2-only read-only queue presentation was added to `initAdmin()`, and `/v2/admin/` explicitly uses the same isolated admin session store as `/admin/`. It introduces no new endpoint, credential, role, SQL operation or bypass.
- All workspace navigation and editorial forms stay inside `#admin-workspace[hidden]` until `getStaffRole()` confirms authorized editor or administrator access. Role changes and sign-outs use existing lock logic.
- The V2 admin path gets the same no-referrer policy, URL credential sanitization and account-navigation suppression as the original `/admin/`. The route is `noindex` and excluded from the sitemap.
- Editorial tasks stay readable in the absence of additional JavaScript beyond the existing editor modules. No novel publishing, rights approval, import or review is silently triggered by navigation.
- Mobile layout and access-denial tests cover unauthenticated, editor, administrator, and revoked-role cases with synthetic responses only.
- Reader-facing private writing studio `/studio/` is **not** the editorial dashboard; only link to its separate interface, do not share admin credentials or policy.

## Rollout rules

- Work in `feat/hunmeng-2-foundation` and follow-up PRs; do not merge design exploration into production before CI and design acceptance.
- Do not deploy preview builds, enable new Telegram webhooks, alter existing notification state, or migrate reader accounts as part of this pilot.
- Keep existing layouts and V1 pages working while implementing V2 pages one by one.
- After a successful pilot, move reusable visual components into a tested V2 design system. Add a neutral public news post **in the same PR** that actually launches visible changes.
- Promote the new homepage to `/` only after: CI, real-catalog smoke tests, responsive and accessibility checks, metadata/SEO review, a tagged release and an agreed rollback.
- Cloudflare's last known production revision at planning time is `0269f21`. Reconfirm the active revision before any subsequent deployment.

## Definition of done for the pilot

- `/v2/` builds in both demo and production modes without disrupting the old homepage.
- All links have a valid destination in existing routes, the search uses real query parameters, images come from already reviewed local assets.
- At 320, 390, 768 and 1280 CSS pixels the page does not horizontally overflow.
- Reduced motion does not hide or animate necessary content; no secrets, credentials, or new network dependencies are added.
- CI passes Node/Playwright on the final exact SHA; no historic green run substitutes for the final commit. The cross-route smoke test is `tests/v2-integration.spec.ts` and detailed release gates are documented in `docs/hunmeng-2-release-candidate.md`.

The V2 pilot is English because the existing public website is English. Future localization is a separately reviewed decision; database labels and user-created text are not silently translated.
