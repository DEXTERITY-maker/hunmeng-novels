-- Halloween Reading Week: one-click join. The leaderboard name now comes from the
-- reader's own profile nickname (auth user metadata), so there is no separate
-- event name to type, keep unique, or rename. Applies on top of
-- halloween-reading-week-20261101.sql. No XP, rank, reward or MP rule changes.
begin;

-- The stored name is no longer used; names are resolved live from the profile.
drop index if exists public.reader_halloween_unique_names;
alter table public.reader_halloween_participants
  drop constraint if exists reader_halloween_participants_display_name_check,
  alter column display_name drop not null;

-- Public name for one participant: the profile nickname when it passes the same
-- rule as the profile form; otherwise a neutral "Reader XXXX". Readers may not
-- pose as the site or staff; Hunmeng team accounts keep their own nickname.
create or replace function private.reader_halloween_public_name(p_user uuid, p_team boolean)
returns text language sql stable security definer set search_path=''
as $$
  with source as (
    select btrim(coalesce(u.raw_user_meta_data->>'nickname','')) as nick
    from auth.users u where u.id = p_user
  )
  select case
    when s.nick ~ '^[[:alnum:]][[:alnum:] _-]{2,23}$'
      and (p_team or lower(s.nick) !~ '(hunmeng|admin|moderator|official|support|staff)')
      then s.nick
    else 'Reader ' || upper(substr(replace(p_user::text,'-',''),1,4))
  end
  from (select coalesce((select nick from source),'') as nick) s
$$;
revoke all on function private.reader_halloween_public_name(uuid,boolean) from public,anon,authenticated;

-- Same ranking as before; only the name source changes.
create or replace function private.reader_halloween_scores()
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
  members as (
    select p.user_id,
      exists(select 1 from public.novel_staff s where s.user_id=p.user_id) as team
    from public.reader_halloween_participants p
    where p.event_id='halloween-2026'
  ),
  ranked as (
    select m.user_id, private.reader_halloween_public_name(m.user_id, m.team) as display_name,
      coalesce(c.chapters,0::bigint) as chapters, c.last_chapter_at,
      row_number() over (
        order by coalesce(c.chapters,0::bigint) desc,
          c.last_chapter_at asc nulls last, m.user_id asc
      )::bigint as place,
      m.team
    from members m
    left join counted c on c.user_id=m.user_id
  )
  select r.user_id,r.display_name,r.chapters,r.last_chapter_at,r.place,r.team
  from ranked r
$$;
revoke all on function private.reader_halloween_scores() from public,anon,authenticated;

-- One-click join: no arguments, no name to choose.
create or replace function private.reader_halloween_join_now()
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'Sign in to join' using errcode='42501'; end if;
  if v_now<timestamptz '2026-10-31 21:00:00+00'
     or v_now>=timestamptz '2026-11-07 21:00:00+00' then
    raise exception 'The event is not open for joining' using errcode='22023';
  end if;
  insert into public.reader_halloween_participants(event_id,user_id)
    values('halloween-2026',v_user)
    on conflict (event_id,user_id) do nothing;
  return true;
end $$;
revoke all on function private.reader_halloween_join_now() from public,anon;
grant execute on function private.reader_halloween_join_now() to authenticated;
create or replace function public.reader_halloween_join_now()
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_halloween_join_now() $$;
revoke all on function public.reader_halloween_join_now() from public,anon;
grant execute on function public.reader_halloween_join_now() to authenticated;

-- Older cached pages may still call join(name): ignore the typed name.
create or replace function private.reader_halloween_join(p_name text)
returns boolean language sql security definer set search_path=''
as $$ select private.reader_halloween_join_now() $$;
-- Renaming is no longer a thing: the name follows the profile nickname.
drop function if exists public.reader_halloween_rename(text);
drop function if exists private.reader_halloween_rename(text);

commit;
