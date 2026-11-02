# Hunmeng 2.0 — architecture and phased rebuild

Status: **exploratory design prototype**, not a production release. The current website and release workflows remain the source of truth.

## Product goals

1. **Visual system:** a cohesive editorial interface with calmer navigation, strong typography, authentic book art, responsive cards, clear focus states, and reduced-motion support.
2. **Discovery:** reliable search by title, author and eventually description, normalized genres/tags, transparent external-source labeling, sorting, and recommendations derived from real content only.
3. **Reader:** preserve canonical chapter URLs and browser/cloud storage keys while improving typography, themes, chapter switching, progress, accessibility, and offline-error handling.
4. **Editorial/admin:** simplify the existing staff workflow around rights verification, chapter import, staged review, publishing, release diagnostics, and role-based access. No public import of unlicensed content.

## Stage 1: isolated homepage pilot (this PR)

- New `/v2/` landing page uses `getLibrary()`, `getLatestChapters()`, `getNews()` and rights-safe `unpublishedExternalEntries()` directly. It contains no invented books or live ranking data.
- Search submits to the existing `/catalog/` route and its search/filter contract.
- Book cards and chapters link to the existing, canonical reader routes; external references remain labeled and link only to their existing metadata pages.
- Reuse `Layout.astro` and its session, appearance, storage, security headers, account navigation and footer. No duplicate auth or storage implementation.
- V2 selectors live in `src/styles/v2-home.css`. Do not append generic overrides to the existing large stylesheets or change V1 components.
- Pilot is `noindex` and omitted from the sitemap; nothing on the live homepage links to it. It must not be used as a marketing announcement.
- Tests cover published fixtures, search, keyboard reachability, viewport overflow, reduced-motion and V1 compatibility.

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

## Stage 4: staff/admin

- Audit current admin tasks and simplify information architecture before changing authorization.
- Keep roles, RLS, publication approvals, rights-gated import, source provenance and chapter review exactly as strict as in production.
- All dangerous operations (publish, bulk import, Telegram send, migrations) stay behind explicit reviewed actions.
- Verify with staff role tests and denied-access tests; never use a Supabase service credential in a public browser.

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
- CI passes Node/Playwright; any snapshots and accessibility issues are reviewed before adoption.

The V2 pilot is English because the existing public website is English. Future localization is a separately reviewed decision; database labels and user-created text are not silently translated.
