-- Founder of Hunmeng: a unique title and emblem for the site's creator.
-- Exactly one account is the founder (the current sole admin). The title can be
-- equipped only by that account. No XP, rank, Reader's Path or MP changes.
begin;

create table if not exists public.reader_founders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default clock_timestamp()
);
alter table public.reader_founders enable row level security;
revoke all on public.reader_founders from public, anon, authenticated;

-- The site owner is the only admin today; refuse to guess if that ever changes.
insert into public.reader_founders(user_id)
select s.user_id from public.novel_staff s
where s.role='admin' and (select count(*) from public.novel_staff where role='admin')=1
on conflict (user_id) do nothing;

create or replace function private.reader_is_founder()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.reader_founders f where f.user_id=(select auth.uid())) $$;
revoke all on function private.reader_is_founder() from public,anon;
grant execute on function private.reader_is_founder() to authenticated;
create or replace function public.reader_is_founder()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.reader_is_founder() $$;
revoke all on function public.reader_is_founder() from public,anon;
grant execute on function public.reader_is_founder() to authenticated;

alter table public.reader_title_selection
  drop constraint if exists reader_title_selection_equipped_title_check;
alter table public.reader_title_selection
  add constraint reader_title_selection_equipped_title_check check (
    equipped_title in ('novice','regular','collector','scifi','reviewer','genres',
      'halloween-2026-gold','halloween-2026-silver','halloween-2026-bronze','founder')
  );

-- Same rules as before (halloween-reading-week-20261101.sql) plus 'founder'.
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
    when 'founder' then exists (select 1 from public.reader_founders f where f.user_id=v_user)
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

commit;
