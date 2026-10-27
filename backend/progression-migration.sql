-- PROPOSED MIGRATION ONLY. Do not apply to production without verifying auth and existing schema.
-- No client INSERT/UPDATE/DELETE rights on XP ledger or derived progression.
create table if not exists public.novel_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (length(event_key) between 8 and 200),
  event_type text not null check (event_type in ('chapter_completed','novel_completed','achievement')),
  amount integer not null check (amount > 0 and amount <= 1000),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index if not exists novel_xp_events_user on public.novel_xp_events(user_id, created_at desc);
create table if not exists public.novel_reader_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id text not null check (length(title_id) between 3 and 64),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
create table if not exists public.novel_reader_title_selection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title_id text not null default 'novice-reader',
  updated_at timestamptz not null default now()
);
create table if not exists public.novel_reader_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null check (length(achievement_id) between 3 and 64),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
alter table public.novel_xp_events enable row level security;
alter table public.novel_reader_titles enable row level security;
alter table public.novel_reader_title_selection enable row level security;
alter table public.novel_reader_achievements enable row level security;
revoke all on public.novel_xp_events, public.novel_reader_titles,
  public.novel_reader_title_selection, public.novel_reader_achievements from anon, authenticated;
grant select on public.novel_xp_events, public.novel_reader_titles,
  public.novel_reader_title_selection, public.novel_reader_achievements to authenticated;
grant all on public.novel_xp_events, public.novel_reader_titles,
  public.novel_reader_title_selection, public.novel_reader_achievements to service_role;
create policy novel_xp_self_read on public.novel_xp_events for select to authenticated using (user_id = (select auth.uid()));
create policy novel_titles_self_read on public.novel_reader_titles for select to authenticated using (user_id = (select auth.uid()));
create policy novel_selection_self_read on public.novel_reader_title_selection for select to authenticated using (user_id = (select auth.uid()));
create policy novel_achievements_self_read on public.novel_reader_achievements for select to authenticated using (user_id = (select auth.uid()));
-- No awarding RPC is intentionally exposed here. A trusted server must verify
-- real completion evidence, grant XP atomically, and deduplicate by event_key.
-- Selection writes must validate that the title is unlocked; do not grant direct
-- UPDATE privileges to clients before that validation exists.
