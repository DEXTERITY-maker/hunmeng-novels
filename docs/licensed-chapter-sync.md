# Licensed API chapter sync for Hunmeng

This feature discovers and imports newly published chapters from **explicitly licensed HTTPS JSON feeds**. It **does not** scrape arbitrary URLs or WTR-Lab. It does not automatically approve or publish text.

## Current safe deployment state

- `scripts/chapter-sync-sources.json` defaults to `{ "sources": [] }`. **No providers or novel texts are configured.**
- Scheduled GitHub Action `Licensed chapter sync (drafts only)` is blocked unless repository variable `HUNMENG_CHAPTER_SYNC_ENABLED=true`.
- The workflow's manual dispatch defaults to a dry run. Scheduled runs, once enabled, execute at 17 and 47 minutes past the hour in UTC (best effort GitHub Actions scheduling).
- Uses existing GitHub Actions `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side secrets. Never put these in frontend code or paste them into chat.
- No production schema migrations or changes to reader pages are needed: `novel_sources`, `novel_translation_jobs`, and the existing publisher are reused.

## Provider API contract

A licensed publisher needs two public, HTTPS JSON endpoints on a single trusted host:
1. List: `GET /v1/books/BOOK_ID/chapters` responds `{ "chapters": [{ "id":"stable-123", "number":123, "title":"Chapter title", "description":"Optional 10–200 character summary" }], "next_cursor":null }`. For subsequent pages, use the same endpoint with `?cursor=<opaque>`. Max 100 entries/page.
2. Content: `GET /v1/chapters/stable-123` responds `{ "id":"stable-123", "number":123, "text":"Full authorized plain-text manuscript..." }`. Text must contain 80–300,000 characters and match the requested chapter identity.

The response must be JSON and fit within 1.1 MB. HTTPS and same-origin request construction are mandatory; redirects and arbitrary URLs are prohibited. This **normalized contract** is for authorized APIs; a real publisher with a different schema needs a reviewed adapter. No upstream authentication is implemented yet.

## Configure a source (after obtaining contractual authorization)

An example below is *illustrative only*, not a connected source:

```json
{
  "sources": [
    {
      "slug": "book-slug-in-supabase",
      "baseUrl": "https://api.licensed-publisher.org",
      "listPath": "/v1/books/123/chapters",
      "chapterPathPrefix": "/v1/chapters/",
      "apiAccessConfirmed": true,
      "republicationConfirmed": true,
      "translationConfirmed": true,
      "licenseReference": "Documented contract identifier and storage reference",
      "licenseExpires": "2028-12-31"
    }
  ]
}
```

Before creating this configuration:
- Get explicit rights to call this API and to **copy/store full text**, translate (if required), and republish it on Hunmeng. Record a reliable evidence reference and expiration date. The JSON flags do not grant rights by themselves.
- Independently verify the corresponding `novel_sources` record, including `rights_status=verified`, `permission_translate=true`, `permission_publish=true`, `verified_at`, `rights_evidence`, and optional `rights_valid_until`. If any check fails, no provider feed is accessed.
- Confirm the API conforms to the contract, source chapter numbers are stable, requests are within contract rate limits, and no paywall is bypassed.
- WTR-Lab domains are explicitly denied by this first integration. Do not remove that guard without independently documented permission and reviewed code.
- Keep the provider allowlist and licenses in a reviewed PR, not an unreviewed live admin form.

## Run and verify

1. Run `node --test tests/chapter-sync.test.mjs` offline; tests use synthetic licensed pages and do not call publishers or Supabase.
2. Run the manual `Licensed chapter sync (drafts only)` workflow with `dry_run=true`. No chapter bodies are retrieved, nothing is written.
3. Only after checking logs and verifying contractual limits, set repository variable `HUNMENG_CHAPTER_SYNC_ENABLED=true`. Scheduled runs will import at most 10 new chapter bodies per provider per execution into private `novel_translation_jobs` rows with `status=draft`, `translated_text=''`; `unique(source_id, chapter_number)` prevents duplicates on retries.
4. Staff review translations and QA before `Publish approved translations` can publish chapters. New content then appears at the existing `/novel/<slug>/<chapter>/` reader route after the normal site deployment. The separate publisher still rechecks rights immediately before publication.
5. To stop importing, disable `HUNMENG_CHAPTER_SYNC_ENABLED` and revoke source rights as appropriate. Previously published static pages require a separate takedown release.

## Limitations and next step

The initial version uses stable **chapter numbers** to identify duplicates, not a persisted external chapter-ID map. Publishers must guarantee stable numbering. Changes to previously imported/published chapter texts are **never overwritten** automatically. Pages are bounded to 10 per run, imports to 10 per provider, and HTTP 429/network errors fail closed until the next run (no aggressive retries). This protects the provider and keeps the private review gate intact. A higher-volume licensed provider can be added with an explicit adapter, persistent cursors, external-ID map, and rate limit negotiated with the provider.
