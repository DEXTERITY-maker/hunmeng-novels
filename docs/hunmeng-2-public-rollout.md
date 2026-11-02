# Hunmeng 2.0 — approved public rollout checklist

User requested launch on 2026-11-02. This documents the **implementation**, not proof of successful production deployment.

## Canonical route plan

- `HUNMENG_V2_PUBLIC=1` produces the new homepage `/` and discovery catalog `/catalog/`.
- The canonical chapter `/novel/:slug/:chapter/` gets the V2 visual layer but retains the existing reader engine, stored state, rewards and server guards.
- `/v2/`, `/v2/catalog/`, `/v2/read/...` and `/v2/admin/` remain independent, **noindexed** previews. The existing `/admin/` editorial app remains canonical; V2 admin is optional staff-facing preview.
- Unset the flag to restore V1 canonical homepage, catalog and reader styling using the same source and unchanged databases.
- The release does not republish copyright-controlled works or expose preview-only scheduled content.

## Release gate and rollback

1. Require both PR and push builds **and** the `v2-public-readiness` build to pass on the final SHA.
2. Review screenshots and live synthetic staff/login tests; no staff credentials are stored in reader localStorage.
3. Merge only with the exact owner-approved title `chore(release): publish Hunmeng 2.0 2026-11-02 [deploy cloudflare]`.
4. The existing Cloudflare workflow verifies the exact `main` SHA, runs full V1 and release V2 browser suites, checks the production build contains no demonstration books, and uploads only to the approved Cloudflare Pages project.
5. Confirm the Pages deployment is successful and open `https://hunmeng-novel.ru/`, `/catalog/`, `/news/` and original login/reader routes; verify correct canonical links, sitemap and noindex previews.
6. If the visual or functional checks fail, **do not change the database**. Roll back through the approved deployment process to the previously verified production SHA `0269f21ff0206c0ef5bd14af2fd4411a12bb0b2e` or another verified newer previous deployment.
7. Never call Cloudflare Pages direct upload outside the approved revision workflow. Do not disable production environment approval or bypass ownership checks.

**Important:** A merge of the source alone is not a deployment. Confirm the Cloudflare Pages deployment in the account before announcing completion.
