-- Halloween Reading Week, 1–7 November 2026 Moscow time.
-- REVIEW ONLY. Apply manually after reviewing previous reader-ranks migrations.
-- This migration never changes level formula, reader sessions, MP or Reader's Path.
begin;

create table public.reader_halloween_participants (
  event_id text not null default 'halloween-2026'
    check (event_id = 'halloween-2026'),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (
    char_length(display_name) between 3 and 24
    and display_name = btrim(display_name)
    and display_name ~ '^[[:alnum:] _-]+$'
  ),
  joined_at timestamptz not null default clock_timestamp(),
  primary key (event_id, user_id)
);
create unique index reader_halloween_unique_names
  on public.reader_halloween_participants(event_id, lower(display_name));
alter table public.reader_halloween_participants enable row level security;
revoke all on public.reader_halloween_participants from public, anon, authenticated;
-- No direct client policies: only narrowly scoped RPCs may access this table.

create table public.reader_halloween_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (event_id = 'halloween-2026'),
  place smallint not null check (place between 1 and 3),
  title_id text not null,
  title text not null,
  badge text not null,
  awarded_at timestamptz not null default clock_timestamp(),
  primary key (user_id, event_id),
  unique (event_id, place),
  constraint reader_halloween_prize_mapping check (
    (place=1 and title_id='halloween-2026-gold'
       and title='Lantern of the Long Night' and badge='gold')
    or (place=2 and title_id='halloween-2026-silver'
       and title='Keeper of the Autumn Moon' and badge='silver')
    or (place=3 and title_id='halloween-2026-bronze'
       and title='Reader of the Falling Leaves' and badge='bronze')
  )
);
alter table public.reader_halloween_rewards enable row level security;
revoke all on public.reader_halloween_rewards from public, anon, authenticated;
-- Awards cannot be inserted, updated or read directly by clients.

create table public.reader_halloween_finalizations (
  event_id text primary key check (event_id = 'halloween-2026'),
  finalized_at timestamptz not null default clock_timestamp(),
  -- NULL when finalized from the Supabase SQL editor by the project owner.
  finalized_by uuid references auth.users(id) on delete set null
);
alter table public.reader_halloween_finalizations enable row level security;
revoke all on public.reader_halloween_finalizations from public, anon, authenticated;

-- Preserve old award conditions exactly, and add only the 3 approved prizes.
alter table public.reader_xp_events
  drop constraint reader_xp_events_event_kind_check,
  drop constraint reader_xp_events_xp_check;
alter table public.reader_xp_events
  add constraint reader_xp_events_event_kind_check
    check (event_kind in ('chapter_finished','novel_finished','event_reward')),
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
    );

-- Extend the existing constraint without unlocking unearned event titles.
alter table public.reader_title_selection
  drop constraint reader_title_selection_equipped_title_check;
alter table public.reader_title_selection
  add constraint reader_title_selection_equipped_title_check check (
    equipped_title in ('novice','regular','collector','scifi','reviewer','genres',
      'halloween-2026-gold','halloween-2026-silver','halloween-2026-bronze')
  );

-- Shared server calculation, based ONLY on verified chapter_finished XP rows.
-- Late joins include already-verified chapters earned inside the event window.
-- For equal chapter counts, earliest last awarded chapter wins.
create function private.reader_halloween_scores()
returns table (
  user_id uuid, display_name text, chapters bigint,
  last_chapter_at timestamptz, place bigint, team boolean
) language sql stable security invoker set search_path=''
as $$
  with counted as (
    select e.user_id, count(*)::bigint as chapters,
      max(e.awarded_at) as last_chapter_at
    from public.reader_xp_events e
    where e.event_kind='chapter_finished'
      and e.awarded_at >= timestamptz '2026-10-31 21:00:00+00'
      and e.awarded_at < timestamptz '2026-11-07 21:00:00+00'
    group by e.user_id
  ),
  ranked as (
    select p.user_id, p.display_name,
      coalesce(c.chapters,0::bigint) as chapters, c.last_chapter_at,
      row_number() over (
        order by coalesce(c.chapters,0::bigint) desc,
          c.last_chapter_at asc nulls last, p.user_id asc
      )::bigint as place,
      exists(select 1 from public.novel_staff s where s.user_id=p.user_id) as team
    from public.reader_halloween_participants p
    left join counted c on c.user_id=p.user_id
    where p.event_id='halloween-2026'
  )
  select r.user_id,r.display_name,r.chapters,r.last_chapter_at,r.place,r.team
  from ranked r
$$;
revoke all on function private.reader_halloween_scores() from public,anon,authenticated;

-- Public guest-safe leaderboard: exactly rank, chosen public name, chapter count.
create function public.reader_halloween_leaderboard()
returns table (place bigint, display_name text, chapters bigint, team boolean)
language sql stable security definer set search_path=''
as $$
  select r.place,r.display_name,r.chapters,r.team
  from private.reader_halloween_scores() r
  order by r.place limit 20
$$;
revoke all on function public.reader_halloween_leaderboard() from public,anon,authenticated;
grant execute on function public.reader_halloween_leaderboard() to anon,authenticated;

create function private.reader_halloween_my_place()
returns table (place bigint, chapters bigint, participating boolean, display_name text)
language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to view your place' using errcode='42501';
  end if;
  return query select s.place,s.chapters,true,s.display_name
    from private.reader_halloween_scores() s where s.user_id=v_user;
  if not found then
    return query select null::bigint,0::bigint,false,null::text;
  end if;
end $$;
revoke all on function private.reader_halloween_my_place() from public,anon;
grant execute on function private.reader_halloween_my_place() to authenticated;
create function public.reader_halloween_my_place()
returns table (place bigint, chapters bigint, participating boolean, display_name text)
language sql stable security invoker set search_path=''
as $$ select * from private.reader_halloween_my_place() $$;
revoke all on function public.reader_halloween_my_place() from public,anon;
grant execute on function public.reader_halloween_my_place() to authenticated;

-- The table's CHECK plus unique functional index are the final authority.
create function private.reader_halloween_valid_name(p_name text)
returns boolean language sql immutable security invoker set search_path=''
as $$
  select p_name is not null
    and char_length(p_name) between 3 and 24
    and p_name=btrim(p_name)
    and p_name ~ '^[[:alnum:] _-]+$'
    -- Readers must not impersonate the site or its staff on a public board.
    and lower(p_name) !~ '(hunmeng|admin|moderator|official|support|staff)'
$$;
revoke all on function private.reader_halloween_valid_name(text) from public,anon,authenticated;

create function private.reader_halloween_join(p_name text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'Sign in to join' using errcode='42501'; end if;
  if v_now<timestamptz '2026-10-31 21:00:00+00'
     or v_now>=timestamptz '2026-11-07 21:00:00+00' then
    raise exception 'The event is not open for joining' using errcode='22023';
  end if;
  if not private.reader_halloween_valid_name(p_name) then
    raise exception 'Use 3–24 letters, digits, spaces, underscore or hyphen' using errcode='22023';
  end if;
  if exists (select 1 from public.reader_halloween_participants
    where event_id='halloween-2026' and user_id=v_user) then
    raise exception 'Already joined; use Rename instead' using errcode='22023';
  end if;
  insert into public.reader_halloween_participants(event_id,user_id,display_name)
    values('halloween-2026',v_user,p_name);
  return true;
end $$;
revoke all on function private.reader_halloween_join(text) from public,anon;
grant execute on function private.reader_halloween_join(text) to authenticated;
create function public.reader_halloween_join(p_name text)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_halloween_join(p_name) $$;
revoke all on function public.reader_halloween_join(text) from public,anon;
grant execute on function public.reader_halloween_join(text) to authenticated;

create function private.reader_halloween_rename(p_name text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Sign in to rename' using errcode='42501'; end if;
  if clock_timestamp() >= timestamptz '2026-11-07 21:00:00+00' then
    raise exception 'The event has ended' using errcode='22023';
  end if;
  if not private.reader_halloween_valid_name(p_name) then
    raise exception 'Use 3–24 letters, digits, spaces, underscore or hyphen' using errcode='22023';
  end if;
  update public.reader_halloween_participants set display_name=p_name
    where event_id='halloween-2026' and user_id=v_user;
  if not found then raise exception 'Join the event first' using errcode='22023'; end if;
  return true;
end $$;
revoke all on function private.reader_halloween_rename(text) from public,anon;
grant execute on function private.reader_halloween_rename(text) to authenticated;
create function public.reader_halloween_rename(p_name text)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_halloween_rename(p_name) $$;
revoke all on function public.reader_halloween_rename(text) from public,anon;
grant execute on function public.reader_halloween_rename(text) to authenticated;

create function private.reader_halloween_leave()
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Sign in to leave' using errcode='42501'; end if;
  if clock_timestamp() >= timestamptz '2026-11-07 21:00:00+00' then
    raise exception 'The event has ended' using errcode='22023';
  end if;
  delete from public.reader_halloween_participants
    where event_id='halloween-2026' and user_id=v_user;
  return found;
end $$;
revoke all on function private.reader_halloween_leave() from public,anon;
grant execute on function private.reader_halloween_leave() to authenticated;
create function public.reader_halloween_leave()
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_halloween_leave() $$;
revoke all on function public.reader_halloween_leave() from public,anon;
grant execute on function public.reader_halloween_leave() to authenticated;

-- Public status contains no participant information.
create function public.reader_halloween_event_finalized()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.reader_halloween_finalizations
    where event_id='halloween-2026')
$$;
revoke all on function public.reader_halloween_event_finalized() from public,anon,authenticated;
grant execute on function public.reader_halloween_event_finalized() to anon,authenticated;

create function private.reader_halloween_my_awards()
returns table (
  event_id text, place smallint, title_id text, title text,
  badge text, awarded_at timestamptz
) language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to see awards' using errcode='42501'; end if;
  return query select r.event_id,r.place,r.title_id,r.title,r.badge,r.awarded_at
    from public.reader_halloween_rewards r where r.user_id=auth.uid()
    order by r.awarded_at desc;
end $$;
revoke all on function private.reader_halloween_my_awards() from public,anon;
grant execute on function private.reader_halloween_my_awards() to authenticated;
create function public.reader_halloween_my_awards()
returns table (
  event_id text, place smallint, title_id text, title text,
  badge text, awarded_at timestamptz
) language sql stable security invoker set search_path=''
as $$ select * from private.reader_halloween_my_awards() $$;
revoke all on function public.reader_halloween_my_awards() from public,anon;
grant execute on function public.reader_halloween_my_awards() to authenticated;

-- Preserve every old, verified title rule from reader-moderated-reviews.
-- Only a genuine saved reward unlocks an event title.
create or replace function private.reader_select_title(p_title text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_stats jsonb; v_ok boolean:=false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_stats:=public.reader_my_progress();
  v_ok:=case p_title
    when 'novice' then true
    when 'regular' then (v_stats->>'readingDays')::integer>=30
    when 'collector' then (v_stats->>'verifiedLibrary')::integer>=50
    when 'scifi' then (v_stats->>'scifiNovels')::integer>=10
    when 'genres' then (v_stats->>'completedGenres')::integer>=10
    when 'reviewer' then (v_stats->>'approvedReviews')::integer>=20
    when 'halloween-2026-gold' then exists (
      select 1 from public.reader_halloween_rewards r
      where r.user_id=v_user and r.event_id='halloween-2026' and r.place=1
        and r.title_id=p_title)
    when 'halloween-2026-silver' then exists (
      select 1 from public.reader_halloween_rewards r
      where r.user_id=v_user and r.event_id='halloween-2026' and r.place=2
        and r.title_id=p_title)
    when 'halloween-2026-bronze' then exists (
      select 1 from public.reader_halloween_rewards r
      where r.user_id=v_user and r.event_id='halloween-2026' and r.place=3
        and r.title_id=p_title)
    else false end;
  if not v_ok then raise exception 'Title is not unlocked' using errcode='42501'; end if;
  insert into public.reader_title_selection(user_id,equipped_title)
    values(v_user,p_title)
    on conflict(user_id) do update set equipped_title=excluded.equipped_title,
      updated_at=clock_timestamp();
  return true;
end $$;
revoke all on function private.reader_select_title(text) from public,anon;
grant execute on function private.reader_select_title(text) to authenticated;
-- public.reader_select_title(text) is the pre-existing invoker wrapper.

-- One manual, admin-only, transactional settlement. No cron or client XP writes.
create function private.reader_halloween_finalize()
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_admin uuid:=auth.uid();
  v_winner record;
  v_title text;
  v_title_id text;
  v_badge text;
  v_xp integer;
  v_prize integer:=0;
begin
  -- Two allowed callers: a signed-in site admin through the API, or the
  -- project owner in the Supabase SQL editor (no auth user, session_user postgres).
  if v_admin is null then
    if session_user not in ('postgres','supabase_admin') then
      raise exception 'Administrator role required' using errcode='42501';
    end if;
  elsif not exists (
    select 1 from public.novel_staff s where s.user_id=v_admin and s.role='admin'
  ) then raise exception 'Administrator role required' using errcode='42501'; end if;
  if clock_timestamp() < timestamptz '2026-11-07 21:00:00+00' then
    raise exception 'Cannot finalize before the event ends' using errcode='22023';
  end if;
  -- Serialize repeat calls, including separate sessions or overlapping requests.
  perform pg_catalog.pg_advisory_xact_lock(20261101,7);
  if exists(select 1 from public.reader_halloween_finalizations
    where event_id='halloween-2026') then return false; end if;

  -- Staff may appear on the board but never take a prize; the next eligible
  -- reader moves up. Prize place is the order among eligible readers.
  for v_winner in select * from private.reader_halloween_scores()
    where chapters>=1 and not team order by place limit 3 loop
    v_prize:=v_prize+1;
    v_xp:=case v_prize when 1 then 3000 when 2 then 2000 else 1000 end;
    v_badge:=case v_prize when 1 then 'gold' when 2 then 'silver' else 'bronze' end;
    v_title_id:='halloween-2026-'||v_badge;
    v_title:=case v_prize
      when 1 then 'Lantern of the Long Night'
      when 2 then 'Keeper of the Autumn Moon'
      else 'Reader of the Falling Leaves' end;

    insert into public.reader_halloween_rewards(user_id,event_id,place,title_id,title,badge)
    values(v_winner.user_id,'halloween-2026',v_prize,v_title_id,v_title,v_badge);
    insert into public.reader_xp_events(user_id,event_kind,novel_slug,chapter_slug,xp)
    values(v_winner.user_id,'event_reward','event-halloween-2026',
      'place-'||v_prize::text,v_xp)
    on conflict (user_id,event_kind,novel_slug,chapter_slug) do nothing;
  end loop;
  insert into public.reader_halloween_finalizations(event_id,finalized_by)
    values ('halloween-2026',v_admin);
  return true;
end $$;
-- Run once after 8 November 00:00 MSK in the SQL editor:
--   select private.reader_halloween_finalize();
-- true = prizes issued; false = already finalized earlier (nothing changes).
revoke all on function private.reader_halloween_finalize() from public,anon;
grant execute on function private.reader_halloween_finalize() to authenticated;
create function public.reader_halloween_finalize()
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_halloween_finalize() $$;
revoke all on function public.reader_halloween_finalize() from public,anon;
grant execute on function public.reader_halloween_finalize() to authenticated;

commit;
