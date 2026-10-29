# Independent Reader's Path — preparation, not a migration

The current site derives six mastery tiers from the XP-derived level and shows nine metallic ranks. The requested design has separate XP/rank and MP/mastery progression, with thirteen tiers in each visual system. This is a change of behavior, not a completed feature. Existing XP and completed achievements must remain untouched.

## Proposed compatibility approach

1. Preserve `reader_xp_events` as the existing XP authority and preserve the XP curve and existing awards. Never rewrite or delete XP events.
2. Introduce a separate server-authoritative MP ledger with idempotent, unique event identities. Award only from verified actions; repeated requests and repeated reading of one chapter cannot create another award. Do not accept MP, rank, event validity or completed-chapter claims from a client.
3. Separate MP calculation and Reader's Path thresholds from `levelFromTotalXp` and `getReaderMastery`. Metallic ranks still use XP; never derive MP or mastery directly from level. Protect any stored grants/titles separately from current calculated progress.
4. Before implementation, determine which historical verified actions have enough reliable evidence for a one-time MP backfill, how to handle earlier tier unlocks and notifications, how to avoid reducing existing earned benefits, and whether migration runs in batches. Produce a count-only dry run and reconciliation report. No user records or credentials belong in a public PR.
5. Prepare an additive migration and rollback plan; use disposable PostgreSQL and isolated Supabase to test role restrictions, idempotency, parallel completion, backfill restart, deleted/revoked users, undo/retry and preservation of XP and library data. Review role ownership and sensitive functions independently before requesting permission for any production change.

The proposed chapter, completed-work, genre and challenge points and tier boundaries are product parameters to confirm before live activation. The first version must not invent historical genre or challenge completions, reuse client-supplied state as proof, or grant retrospective awards merely because an XP level maps to an old display tier. The current local PR makes no database or MP changes.
