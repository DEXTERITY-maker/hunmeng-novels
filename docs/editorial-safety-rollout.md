# Editorial safety rollout (27 October 2026)

This change separates *unsubmitted drafts*, *review-ready chapters*, *approved chapters*, and *published content*. It does not put drafts into static public content.

## Deployment order

1. Confirm this pull request passes the full GitHub CI (Astro/TypeScript, production/demo builds, Playwright, Node tests).
2. Apply `backend/editorial-safety-20261027.sql` to the **hunmeng-novels** Supabase database and confirm that `created_by`, RLS policies and `novel_guard_job` are in place.
3. Merge and deploy this PR only after the migration succeeds.
4. Use distinct real editor/admin test accounts with permitted test source material to verify draft/review transitions. Never use third-party chapters without publication rights.
5. Verify publisher end-to-end with isolated, rights-cleared QA fixtures. Avoid touching real approved publications during tests.

The migration adds an owner field. Legacy jobs without an owner remain visible to admins only; administrators must triage them manually instead of guessing their creator. At the time of authoring the table has no rows.

## State transition policy

- INSERT: `draft` (incomplete allowed) or `review` (complete source, translation and description required).
- `draft -> review`: explicit submission. `review -> draft`: explicit withdrawal.
- `review -> approved`: administrators only, with evidence of publication rights, verified status, required QA, glossary checks, human reviewer notes.
- `approved -> review`: explicit administrator-only withdrawal. Approval metadata is cleared; editing the approved version itself is rejected.
- `approved -> published`: server publisher only, with rights/QA revalidated by the database.
- `published`: immutable.

Admin users can see all editorial jobs; regular editors can see only their own. Anonymous users and readers have no access. Ownership is set by the database trigger, not accepted from the client.

## Concurrent edits and server acknowledgements

Every PATCH uses an `updated_at` precondition. If no row was updated (stale version, deleted job, or permission failure), the UI reports a conflict rather than success. All editorial mutation responses must confirm exactly one affected row. Forms lock during mutation and list refresh.

## Publication race limits

The publishing workflow stages **only approved** jobs, records the job/source versions and glossary snapshot, and revalidates everything immediately before `git push`. This prevents stale jobs or revoked rights **detected by preflight** from being pushed.

There is still a theoretical race between that final check and the Git push/Timeweb rollout because PostgreSQL and Git are separate systems. Fully atomic revocation in that interval requires a publication reservation protocol or a compensating takedown workflow; do not advertise this as a transactional guarantee. If rights are revoked during an active publication, immediately review the deployment and take down any affected content.

## Notes

- Do not include service-role credentials in browser bundles, files or logs.
- The SQL migration must be applied before deploying the new UI. Without it, the added owner column is missing and editor job queries will fail.
- Keep existing reader library and personal author-studio RLS settings unchanged.
