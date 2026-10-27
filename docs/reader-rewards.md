# Hunmeng reader progression — operating notes

## What is live after deployment
The 500-level curve and nine rank boundaries are centralized in
`src/lib/reader-progression.ts`. XP lives exclusively in
`public.reader_xp_events`; readers never supply XP, levels or ranks.
A published chapter may receive 80 XP once, after a server-issued
session has been open for at least 90 seconds and the reader has
navigated to the end of the chapter. A fully finished and registered
novel provides one additional 400 XP. The 500-level cap applies to
display, not to deletion of historical XP.

`src/lib/storage.ts` retains local library and reading progress.
Guests are not assigned server XP, and browser progress must not be
backfilled into the XP ledger. Reader Auth account metadata controls
nickname, bio and avatar color, not rank or XP.

## Database: review and installation
Three additive migrations, in required order:

1. `backend/reader-ranks-xp-20261027.sql`
2. `backend/reader-ranks-security-hardening-20261027.sql`
3. `backend/reader-ranks-achievement-dates-20261027.sql`

They were applied to the connected Hunmeng Supabase project after schema
inspection. Verify with:
```sql
select count(*) from public.reader_chapter_registry;
select public.reader_rank_for_level(140),public.reader_rank_for_level(175);
select has_table_privilege('authenticated','public.reader_xp_events','INSERT');
select has_function_privilege('anon','public.reader_finish_chapter(uuid)','EXECUTE');
```
The last two values must be false. Read the security advisors after applying
new migrations; privileged implementations live in the `private` schema,
public wrappers run as the caller. The read sessions table has RLS and no
client table grants. Sessions are limited to 60 starts per day and expire
for rewards after 4 hours.

## Registering newly published chapters
Only published chapters may award XP. The initial migration lists 90
approved chapters from the production content tree at the time of rollout.
When publishing more chapters, add their canonical slugs to
`public.reader_chapter_registry` **through a reviewed database migration**
before reader rewards for those new chapters can work. Use the chapter's
actual genres and number. Mark `finished_novel=true` only when the
entire edition is complete, rights-cleared and its full chapter registry
has been checked. Do not grant insert/update to `anon` or `authenticated`.

## Titles and achievement verification
Novice Reader is unlocked from the start. Regular Reader (30 distinct
server-awarded days), Science Fiction Enthusiast (10 server-awarded
completed fantasy/science-fiction novels) and Genre Sage (10 distinct
verified genres) are determined from the award ledger. Collector
(50 novels in a *verified*, account-linked library) and Reviewer
(20 moderated, approved reviews) are **not yet earnable**, because
Hunmeng does not currently have trusted backend data for these actions.
Do not infer title unlocks from localStorage or auth user_metadata.

Chapter completion evidence is limited to a server-timed session and a
browser end-of-chapter action. This limits quick replay/farming but
cannot cryptographically prove human comprehension. One chapter can
only be rewarded once per account, regardless of device.

## Feature limitations
Reading position and local library do not sync between devices yet.
Only XP events and selected titles are account-backed. Rank promotion
notification acknowledgements are stored server-side. Rank assets are
standalone SVGs under `public/images/ranks/`. Stored ranks are never
edited manually; they derive from total XP. Enhancing the admin interface,
moderated reviews and trusted library syncing require separate, reviewed
backend implementations.
