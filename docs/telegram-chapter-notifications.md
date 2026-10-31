# Telegram notifications for new chapters

This service is intentionally **separate from production deployment**. It reads public release information and only writes its own GitHub branch. It never updates Supabase.

## Triggers and sources

- Daily GitHub Actions schedule: `09:05 UTC = 12:05 Europe/Moscow`. Reads `serial_editions` and the RLS-visible `serial_chapters` through Supabase REST, using only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env.production` (or runtime environment). It does not query unreleased manuscripts.
- Successful `deploy` job in `Cloudflare Pages deployment (approved revision only)`: reads chapters from **that deployed commit**, not potentially unpublished `main`. Compares to the previously recorded deployed commit and checks that the public chapter URLs respond successfully.
- Scheduled runs can also recover a successful deployment missed by a notification workflow: they inspect the latest actual successful `deploy` job.

Any failure of the website or public Supabase REST skips announcements and leaves the ledger unchanged. The deployment never waits on Telegram.

## Deduplication and first run

The workflow has one shared `concurrency` group across all triggers, with `cancel-in-progress: false`. Its durable ledger is `state.json` in the separate `telegram-notification-state` branch. Only that branch is written by this workflow. Each chapter uses the identity `novelSlug:number`; changes to chapter titles do not create duplicates. Deleted entries are retained.

On the **first non-dry run**, all chapters already published in the deployed commit and all initial publicly released Supabase chapters are marked `baseline`, without any channel posts. No earlier chapters are replayed. The ledger records the current deployed SHA.

On subsequent runs, a new chapter is first marked `reserved` and the reservation is pushed to the state branch **before** contacting `sendMessage`. On confirmed delivery, the entry becomes `sent` and records Telegram's message ID. The Git push rejects non-fast-forward races even if the GitHub Actions concurrency configuration is bypassed.

**Guarantee and limitation:** the Telegram Bot API `sendMessage` does **not** accept an idempotency key. No system can guarantee automatic exactly-once delivery across ambiguous network failures using that API. This implementation prioritizes **no duplicate posts**: if the request succeeded but its response was lost, the reserved chapter is **not** automatically resent. If a reservation remains, inspect `@hunmengnovels` and `state.json` and resolve it manually. If the post is present, change the marker to `sent` in the ledger. If the post is definitely absent, after verifying the channel, the operator may remove the reservation and rerun the workflow. Never blindly delete reservations.

The token stays only in `TELEGRAM_BOT_TOKEN` GitHub Actions secret. The script never prints it or raw Telegram URLs/errors. A public publishable key is not a service role key.

## Dry run and launch

After merging this PR to `main`, use GitHub **Actions → Telegram new chapter notices → Run workflow**, select `main`, set **dry_run = true**. The output lists which notices would be published or baselined. Dry run does not write the ledger and does not call Telegram.

For safe activation, first select **dry_run = false** once. This creates the baseline without posting any old chapters. After that, the workflow automatically checks daily and after successful Cloudflare production deployment. `TELEGRAM_BOT_TOKEN` must be present; the configured bot must retain publishing permission in `@hunmengnovels`. The repository must allow its `GITHUB_TOKEN` to push the separate ledger branch (workflow `contents: write`). No Supabase migrations, database changes or additional private Supabase keys are required.

If a branch protection rule blocks creating `telegram-notification-state`, the initial non-dry run fails closed; arrange write permission to **that service branch only** before enabling automatic notices.

Tests use fake senders and synthetic release lists; they never contact Telegram or Supabase.
