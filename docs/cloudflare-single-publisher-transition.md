# Cloudflare Pages as the sole intended publisher — staging proposal

This branch **does not change production**. It prepares a reviewable switch to the already-connected Cloudflare Pages custom domain.

## Verified background (29 October 2026)
- `hunmeng-novel.ru` and `www.hunmeng-novel.ru` are attached to the existing Cloudflare Pages project `hunmeng-novels`.
- Manual GitHub Actions Pages deployment of SHA `e9b841e1108d1a9b0136d81d0c37fe5bac261465` completed successfully (run 40789974567).
- `.github/workflows/check.yml` still contained an automatic Timeweb job on each `main` push. That can cause competing releases after a PR merge.
- The fallback canonical URL in `src/config/site.ts` still referenced the old technical Timeweb domain, even though Cloudflare build overrides `SITE_URL`.

## Proposed changes
1. Keep existing Timeweb script for documented emergency rollback, but set the legacy GitHub Actions job conditional to `false`. This prevents *both* automatic and accidentally dispatched Timeweb releases from that job.
2. Change fallback canonical URL to `https://hunmeng-novel.ru`. The explicit `SITE_URL` for Cloudflare manual deploy stays unchanged.
3. Preserve **manual** Cloudflare Pages deploy with exact-main-SHA check, tests and explicit GitHub environment `pages-production`. No automatic production deployment on a PR or a push.
4. Add small static regression checks for these invariants.

## Owner pre-merge checklist
- Verify the active Cloudflare Pages production domain, security settings and prior deployment ID.
- Confirm Cloudflare Pages is the preferred production host and Timeweb should no longer auto-deploy.
- Review branch protection and **configure** the `pages-production` environment with required reviewers if desired. An environment name alone grants no approval gate.
- Ensure the existing manual GitHub Actions deploy credentials are maintained by the account owner. Never copy API tokens into source or chat.
- Before merge, check whether there are other Timeweb deploy triggers outside `check.yml` (external source integrations, dashboard deploys, repository automations).
- Merge only with explicit user authorization. Run a single approved manual Pages deploy of the then-current `main` SHA and verify canonical URL, sitemap, routing, reading and login in production.

This change does **not** remove backup files or touch Cloudflare, Timeweb, Supabase or reader accounts.
