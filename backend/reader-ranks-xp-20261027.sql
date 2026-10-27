-- Hunmeng reader ranks v1. Additive migration. No existing reading or auth records change.
-- Only verified, authenticated database RPCs can insert XP. Local scroll data
-- cannot be imported as XP. Registry includes only approved published chapters.
create table if not exists public.reader_chapter_registry (
  novel_slug text not null check (novel_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  chapter_slug text not null check (chapter_slug ~ '^chapter-[1-9][0-9]*$'),
  chapter_number integer not null check (chapter_number > 0),
  genres text[] not null default '{}',
  finished_novel boolean not null default false,
  primary key (novel_slug,chapter_slug)
);
alter table public.reader_chapter_registry enable row level security;
revoke all on public.reader_chapter_registry from public,anon,authenticated;
grant select on public.reader_chapter_registry to anon,authenticated;
create policy reader_chapter_registry_public on public.reader_chapter_registry
  for select to anon,authenticated using (true);

insert into public.reader_chapter_registry (novel_slug,chapter_slug,chapter_number,genres,finished_novel)
values
('comprehension-against-the-heavens','chapter-1',1,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('comprehension-against-the-heavens','chapter-2',2,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('comprehension-against-the-heavens','chapter-3',3,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('comprehension-against-the-heavens','chapter-4',4,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('comprehension-against-the-heavens','chapter-5',5,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('comprehension-against-the-heavens','chapter-6',6,ARRAY['Urban fantasy','Science fiction','Action']::text[],false),
('the-latency-of-tomorrow','chapter-1',1,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-10',10,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-11',11,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-12',12,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-13',13,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-14',14,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-15',15,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-16',16,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-17',17,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-18',18,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-19',19,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-2',2,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-20',20,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-21',21,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-22',22,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-23',23,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-24',24,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-25',25,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-26',26,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-27',27,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-28',28,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-29',29,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-3',3,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-30',30,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-31',31,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-32',32,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-33',33,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-34',34,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-35',35,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-36',36,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-37',37,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-38',38,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-39',39,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-4',4,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-40',40,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-41',41,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-42',42,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-43',43,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-44',44,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-45',45,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-46',46,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-47',47,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-48',48,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-49',49,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-5',5,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-50',50,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-51',51,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-52',52,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-53',53,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-54',54,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-55',55,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-56',56,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-57',57,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-58',58,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-59',59,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-6',6,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-60',60,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-61',61,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-62',62,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-63',63,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-64',64,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-65',65,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-66',66,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-67',67,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-68',68,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-69',69,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-7',7,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-70',70,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-71',71,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-72',72,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-73',73,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-74',74,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-75',75,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-76',76,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-77',77,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-78',78,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-79',79,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-8',8,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-80',80,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-81',81,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-82',82,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-83',83,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-84',84,ARRAY['Science fiction','Mystery']::text[],false),
('the-latency-of-tomorrow','chapter-9',9,ARRAY['Science fiction','Mystery']::text[],false)
on conflict (novel_slug,chapter_slug) do update set
  chapter_number=excluded.chapter_number,genres=excluded.genres,
  finished_novel=excluded.finished_novel;

create table if not exists public.reader_chapter_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  novel_slug text not null,
  chapter_slug text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  foreign key (novel_slug,chapter_slug) references public.reader_chapter_registry(novel_slug,chapter_slug)
);
create index if not exists reader_sessions_by_user on public.reader_chapter_sessions(user_id,started_at desc);
alter table public.reader_chapter_sessions enable row level security;
revoke all on public.reader_chapter_sessions from public,anon,authenticated;
-- Session IDs are issued and mutated exclusively by authenticated RPCs.

create table if not exists public.reader_xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null check (event_kind in ('chapter_finished','novel_finished')),
  novel_slug text not null,
  chapter_slug text not null default '',
  xp integer not null check ((event_kind='chapter_finished' and xp=80) or
     (event_kind='novel_finished' and xp=400)),
  awarded_at timestamptz not null default clock_timestamp(),
  unique (user_id,event_kind,novel_slug,chapter_slug)
);
create index if not exists reader_xp_by_user on public.reader_xp_events(user_id,awarded_at desc);
alter table public.reader_xp_events enable row level security;
revoke all on public.reader_xp_events from public,anon,authenticated;
grant select on public.reader_xp_events to authenticated;
create policy reader_xp_self_read on public.reader_xp_events
  for select to authenticated using (user_id=(select auth.uid()));

create table if not exists public.reader_title_selection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_title text not null default 'novice' check
    (equipped_title in ('novice','regular','collector','scifi','reviewer','genres')),
  notified_rank text check
    (notified_rank is null or notified_rank in
      ('iron','bronze','silver','gold','dark-gold','platinum','diamond','legendary','mythical')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.reader_title_selection enable row level security;
revoke all on public.reader_title_selection from public,anon,authenticated;
grant select on public.reader_title_selection to authenticated;
create policy reader_title_self_read on public.reader_title_selection
  for select to authenticated using (user_id=(select auth.uid()));

-- The XP formula must match src/lib/reader-progression.ts.
create or replace function public.reader_xp_for_next(p_level integer)
returns integer language sql immutable strict security invoker set search_path=''
as $$ select case when p_level >= 500 then 0 else
  500 + 4 * greatest(0,p_level-1) + floor(26*sqrt(greatest(0,p_level-1)))::integer end $$;
create or replace function public.reader_level_for_xp(p_total bigint)
returns integer language plpgsql immutable strict security invoker set search_path=''
as $$
declare v_level integer := 1; v_left bigint := greatest(0,p_total);
begin
  while v_level < 500 and v_left >= public.reader_xp_for_next(v_level) loop
    v_left := v_left-public.reader_xp_for_next(v_level);
    v_level := v_level+1;
  end loop;
  return v_level;
end $$;
create or replace function public.reader_rank_for_level(p_level integer)
returns text language sql immutable strict security invoker set search_path=''
as $$ select case
  when p_level >= 420 then 'mythical'
  when p_level >= 330 then 'legendary'
  when p_level >= 250 then 'diamond'
  when p_level >= 175 then 'platinum'
  when p_level >= 140 then 'dark-gold'
  when p_level >= 110 then 'gold'
  when p_level >= 60 then 'silver'
  when p_level >= 25 then 'bronze'
  else 'iron' end $$;
-- These helpers never modify data; no public API execute necessary.
revoke execute on function public.reader_xp_for_next(integer) from public,anon,authenticated;
revoke execute on function public.reader_level_for_xp(bigint) from public,anon,authenticated;
revoke execute on function public.reader_rank_for_level(integer) from public,anon,authenticated;

-- Begin a verified reading session. At most 60 new starts per calendar day.
-- Server time is authoritative. A guest cannot start or claim any session.
create or replace function public.reader_begin_chapter(p_novel text,p_chapter text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists (select 1 from public.reader_chapter_registry c
    where c.novel_slug=p_novel and c.chapter_slug=p_chapter) then
    raise exception 'This chapter is not eligible' using errcode='22023'; end if;
  if exists (select 1 from public.reader_xp_events e where e.user_id=v_user and
    e.event_kind='chapter_finished' and e.novel_slug=p_novel and e.chapter_slug=p_chapter) then
    return null;
  end if;
  select s.id into v_id from public.reader_chapter_sessions s
    where s.user_id=v_user and s.novel_slug=p_novel and s.chapter_slug=p_chapter
      and s.completed_at is null and s.started_at>clock_timestamp()-interval '4 hours'
    order by s.started_at desc limit 1;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.reader_chapter_sessions s
       where s.user_id=v_user and s.started_at>=date_trunc('day',clock_timestamp()))>=60 then
    raise exception 'Daily reading session limit reached' using errcode='22023'; end if;
  insert into public.reader_chapter_sessions (user_id,novel_slug,chapter_slug)
    values (v_user,p_novel,p_chapter) returning id into v_id;
  return v_id;
end $$;

-- Completing a session requires >=90s of server elapsed time, a published
-- chapter and its own session. XP is idempotent across tabs/devices.
create or replace function public.reader_finish_chapter(p_session uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); s public.reader_chapter_sessions%rowtype; v_awarded boolean:=false; v_rows integer:=0;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into s from public.reader_chapter_sessions
    where id=p_session and user_id=v_user for update;
  if not found then raise exception 'Session not found' using errcode='42501'; end if;
  if s.completed_at is not null then return false; end if;
  if s.started_at > clock_timestamp()-interval '90 seconds'
     or s.started_at < clock_timestamp()-interval '4 hours' then
    return false;
  end if;
  update public.reader_chapter_sessions set completed_at=clock_timestamp() where id=s.id;
  insert into public.reader_xp_events(user_id,event_kind,novel_slug,chapter_slug,xp)
    values (v_user,'chapter_finished',s.novel_slug,s.chapter_slug,80)
    on conflict (user_id,event_kind,novel_slug,chapter_slug) do nothing;
  get diagnostics v_rows = row_count;
  v_awarded := v_rows > 0;
  -- Book awards require a finished edition AND all its registered chapters.
  if v_awarded and exists (
    select 1 from public.reader_chapter_registry r
      where r.novel_slug=s.novel_slug and r.finished_novel
  ) and not exists (
    select 1 from public.reader_chapter_registry r
      where r.novel_slug=s.novel_slug and not exists (
        select 1 from public.reader_xp_events e
        where e.user_id=v_user and e.event_kind='chapter_finished'
          and e.novel_slug=r.novel_slug and e.chapter_slug=r.chapter_slug
      )
  ) then
    insert into public.reader_xp_events(user_id,event_kind,novel_slug,chapter_slug,xp)
      values (v_user,'novel_finished',s.novel_slug,'',400)
      on conflict (user_id,event_kind,novel_slug,chapter_slug) do nothing;
  end if;
  return v_awarded;
end $$;

-- Server-derived reader statistics. No browser-supplied XP, level, rank or title.
create or replace function public.reader_my_progress()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_xp bigint; v_chapters integer; v_books integer;
 v_days integer; v_scifi integer; v_genres integer; v_title text; v_notified text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(sum(xp),0),count(*) filter (where event_kind='chapter_finished'),
    count(*) filter (where event_kind='novel_finished')
   into v_xp,v_chapters,v_books from public.reader_xp_events where user_id=v_user;
 select count(distinct awarded_at::date) into v_days from public.reader_xp_events
   where user_id=v_user and event_kind='chapter_finished';
 select count(distinct e.novel_slug) into v_scifi from public.reader_xp_events e
   where e.user_id=v_user and e.event_kind='novel_finished'
   and exists (select 1 from public.reader_chapter_registry r
     where r.novel_slug=e.novel_slug and ('Science fiction'=any(r.genres)
       or 'Fantasy'=any(r.genres) or 'Urban fantasy'=any(r.genres)));
 select count(distinct genre) into v_genres
   from public.reader_xp_events e
   join public.reader_chapter_registry r on e.novel_slug=r.novel_slug,
   unnest(r.genres) genre
   where e.user_id=v_user and e.event_kind='novel_finished';
 select equipped_title,notified_rank into v_title,v_notified
   from public.reader_title_selection where user_id=v_user;
 return jsonb_build_object(
   'total_xp',v_xp,'chapters',v_chapters,'completedNovels',v_books,'readingDays',v_days,
   'scifiNovels',v_scifi,'completedGenres',v_genres,
   'selected_title',coalesce(v_title,'novice'),'last_rank_notified',v_notified,
   'level',public.reader_level_for_xp(v_xp),
   'rank',public.reader_rank_for_level(public.reader_level_for_xp(v_xp))
 );
end $$;

create or replace function public.reader_select_title(p_title text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_stats jsonb; v_ok boolean:=false;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_stats:=public.reader_my_progress();
 v_ok:=case p_title
   when 'novice' then true
   when 'regular' then (v_stats->>'readingDays')::integer>=30
   when 'scifi' then (v_stats->>'scifiNovels')::integer>=10
   when 'genres' then (v_stats->>'completedGenres')::integer>=10
   else false end;
 -- Collector/reviewer stay locked until authoritative server metrics exist.
 if not v_ok then raise exception 'Title is not unlocked' using errcode='42501'; end if;
 insert into public.reader_title_selection(user_id,equipped_title)
 values (v_user,p_title)
 on conflict(user_id) do update set equipped_title=excluded.equipped_title,
   updated_at=clock_timestamp();
 return true;
end $$;

create or replace function public.reader_mark_rank_seen(p_rank text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_rank text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_rank := public.reader_rank_for_level(public.reader_level_for_xp(
    (select coalesce(sum(xp),0) from public.reader_xp_events where user_id=v_user)));
 if p_rank <> v_rank then return false; end if;
 insert into public.reader_title_selection(user_id,notified_rank) values(v_user,v_rank)
 on conflict(user_id) do update set notified_rank=excluded.notified_rank,
 updated_at=clock_timestamp();
 return true;
end $$;

-- Locked down functions: all public/anon execute rights revoked.
revoke execute on function public.reader_begin_chapter(text,text) from public,anon;
revoke execute on function public.reader_finish_chapter(uuid) from public,anon;
revoke execute on function public.reader_my_progress() from public,anon;
revoke execute on function public.reader_select_title(text) from public,anon;
revoke execute on function public.reader_mark_rank_seen(text) from public,anon;
grant execute on function public.reader_begin_chapter(text,text),
 public.reader_finish_chapter(uuid),public.reader_my_progress(),
 public.reader_select_title(text),public.reader_mark_rank_seen(text) to authenticated;
