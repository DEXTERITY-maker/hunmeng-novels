# Hunmeng 0.1.4 — discovery and reading audit

Draft based on main `e9b841e`. This branch is not deployed and does not change database schemas, RLS, XP, MP, reader storage formats, or production data.

The existing site already provides distinct genre and tag directories; title/original-title/author search; included and excluded tags with all/any matching; distinct original and translation statuses; chapter-list pagination; a novel glossary; reading preferences and per-chapter position; shelf categories; optional account synchronization; and moderated reviews. The personal star rating is local to the browser and does not calculate a public aggregate. These are existing capabilities, not new systems in this branch.

The current branch extends catalog search to optional alternative titles, multiple included and excluded genres, chapter-count bounds, visible removable filters, and clearer loading/failure states. Novel pages group their existing tags and show alternative titles when present. Library search uses existing shelf and progress records; loading, empty shelf, no results and catalog failure are distinct. A missing cover field falls back to the existing local placeholder. Version metadata is updated to 0.1.4.

The original request foundation and HTTP/moderation prototypes remain in draft PRs #62/#66, based on a different branch. They are not connected to the site. The mobile preview in #68 is also disconnected. Do not claim request submission, source suggestions, moderation or automatic translation is live. Further work needs a verified staging environment, supported-source policies, secure runtime and rate limits, source-suggestion model, user and moderation UI, and data-preserving migrations before release.

Personal term replacement, multi-folder library membership, shared rating aggregates and scalable server-side discovery remain unimplemented. The pre-existing work glossary is read-only. XP and MP rules are deliberately unchanged; the current branch does not assert that the future independent MP system is fully implemented.

The WTR-LAB public catalog and novel finder were inspected for UI ideas only: combined criteria, all/any matching, chapter bounds, visible statuses and grouping. No stories, descriptions, covers, logos, or application code were imported.
