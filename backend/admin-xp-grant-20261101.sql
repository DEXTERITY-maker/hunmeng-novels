-- Administrator XP grant: lets the site owner set an account's XP directly
-- (e.g. level 500 for the owner's own account). Grants are a separate event kind,
-- so they never count as chapters, novels, reading days, achievements or
-- Halloween leaderboard chapters. Writing is only possible from the SQL editor
-- or service role: clients keep read-only access to reader_xp_events.
begin;

alter table public.reader_xp_events
  drop constraint if exists reader_xp_events_event_kind_check,
  drop constraint if exists reader_xp_events_xp_check;
alter table public.reader_xp_events
  add constraint reader_xp_events_event_kind_check
    check (event_kind in ('chapter_finished','novel_finished','event_reward','admin_grant')),
  add constraint reader_xp_events_xp_check
    check (
      (event_kind='chapter_finished' and xp=80)
      or (event_kind='novel_finished' and xp=400)
      or (event_kind='event_reward'
        and novel_slug='event-halloween-2026'
        and (
          (chapter_slug='place-1' and xp=3000)
          or (chapter_slug='place-2' and xp=2000)
          or (chapter_slug='place-3' and xp=1000)
        ))
      -- 939 183 XP is exactly level 500; a grant can never exceed it.
      or (event_kind='admin_grant' and novel_slug='admin-grant' and xp between 1 and 939183)
    );

commit;

-- Usage (SQL editor). Level 500 for the owner (the only admin in novel_staff):
--   insert into public.reader_xp_events(user_id,event_kind,novel_slug,chapter_slug,xp)
--   select user_id,'admin_grant','admin-grant','level-500',939183
--   from public.novel_staff where role='admin'
--   on conflict (user_id,event_kind,novel_slug,chapter_slug) do nothing;
-- Undo:
--   delete from public.reader_xp_events where event_kind='admin_grant' and chapter_slug='level-500';
