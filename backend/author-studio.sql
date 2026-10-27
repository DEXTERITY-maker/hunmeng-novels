-- Private, per-account original-fiction workspaces. Never included in Astro's public build.
-- Apply once on the Hunmeng Supabase project; keep the production deployment separate.
begin;

-- The source plan already specifies 85 opening chapters; the inactive database
-- edition was created with 50. Never change an activated release schedule.
do $$
begin
  if exists (
    select 1 from public.serial_editions
    where slug = 'the-latency-of-tomorrow'
      and launch_at is not null and initial_chapters <> 85
  ) then
    raise exception 'Do not modify an already activated serial schedule';
  end if;
end;
$$;
update public.serial_editions set initial_chapters = 85
  where slug = 'the-latency-of-tomorrow' and launch_at is null;
alter table public.serial_chapters
  drop constraint if exists serial_chapters_body_check;
alter table public.serial_chapters
  add constraint serial_chapters_body_check
  check (char_length(body) between 4000 and 8500 and body = btrim(body));

create table if not exists public.author_novels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 250),
  synopsis text not null default '' check (char_length(synopsis) <= 10000),
  outline text not null default '' check (char_length(outline) <= 100000),
  characters text not null default '' check (char_length(characters) <= 100000),
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.author_chapters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null,
  owner_id uuid not null default auth.uid(),
  number integer not null check (number between 1 and 1000000),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  body text not null default '' check (char_length(body) <= 300000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (novel_id, number),
  foreign key (novel_id, owner_id)
    references public.author_novels(id, owner_id) on delete cascade
);

-- Explicit, append-only snapshots. Ordinary autosaves do not flood history.
create table if not exists public.author_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  owner_id uuid not null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  body text not null check (char_length(body) <= 300000),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, owner_id)
    references public.author_chapters(id, owner_id) on delete cascade
);

create index if not exists author_novels_owner_recent
  on public.author_novels (owner_id, updated_at desc);
create index if not exists author_chapters_novel_order
  on public.author_chapters (novel_id, number);
create index if not exists author_revisions_chapter_recent
  on public.author_revisions (chapter_id, created_at desc);

alter table public.author_novels enable row level security;
alter table public.author_chapters enable row level security;
alter table public.author_revisions enable row level security;
revoke all on public.author_novels, public.author_chapters, public.author_revisions
  from anon, authenticated;
grant select, insert, update, delete on public.author_novels, public.author_chapters
  to authenticated;
grant select, insert on public.author_revisions to authenticated;

create policy author_novels_owner_read on public.author_novels
  for select to authenticated using (owner_id = (select auth.uid()));
create policy author_novels_owner_insert on public.author_novels
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy author_novels_owner_update on public.author_novels
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy author_novels_owner_delete on public.author_novels
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy author_chapters_owner_read on public.author_chapters
  for select to authenticated using (owner_id = (select auth.uid()));
create policy author_chapters_owner_insert on public.author_chapters
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy author_chapters_owner_update on public.author_chapters
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy author_chapters_owner_delete on public.author_chapters
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy author_revisions_owner_read on public.author_revisions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy author_revisions_owner_insert on public.author_revisions
  for insert to authenticated with check (owner_id = (select auth.uid()));
-- Deliberately no UPDATE/DELETE grant or policy for history.
commit;
