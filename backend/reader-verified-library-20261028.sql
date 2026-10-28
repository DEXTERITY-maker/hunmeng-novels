-- Hunmeng: verified first-time library additions and Collector title.
-- Additive migration. Does not modify existing XP, profile data, or reader saves.
-- Existing local guest libraries are intentionally NOT retroactively credited.
create table if not exists public.reader_verified_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  novel_slug text not null check (novel_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_added_at timestamptz not null default clock_timestamp(),
  primary key (user_id, novel_slug)
);
create index if not exists reader_verified_library_user_date
  on public.reader_verified_library(user_id, first_added_at desc);
alter table public.reader_verified_library enable row level security;
revoke all on public.reader_verified_library from public, anon, authenticated;
grant select on public.reader_verified_library to authenticated;
drop policy if exists reader_verified_library_owner on public.reader_verified_library;
create policy reader_verified_library_owner on public.reader_verified_library
  for select to authenticated using (user_id=(select auth.uid()));

-- Only a genuine catalog novel is eligible. This operation is idempotent and
-- capped to 20 distinct new titles a day; toggling shelves never duplicates it.
-- It never grants XP. Client-provided level/rank and local browser data are ignored.
create or replace function private.reader_record_library_add(p_novel text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_novel is null or length(p_novel)>120 or not exists (
  select 1 from public.reader_chapter_registry
  where novel_slug=p_novel
 ) then raise exception 'Novel is not eligible' using errcode='22023'; end if;
 if exists(select 1 from public.reader_verified_library
   where user_id=v_user and novel_slug=p_novel) then return false; end if;
 if (select count(*) from public.reader_verified_library
   where user_id=v_user and first_added_at >= date_trunc('day',clock_timestamp())) >= 20 then
   raise exception 'Daily collection limit reached' using errcode='22023';
 end if;
 insert into public.reader_verified_library(user_id,novel_slug)
  values(v_user,p_novel) on conflict (user_id,novel_slug) do nothing;
 return found;
end $$;
revoke execute on function private.reader_record_library_add(text) from public,anon;
grant execute on function private.reader_record_library_add(text) to authenticated;
create or replace function public.reader_record_library_add(p_novel text)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_record_library_add(p_novel) $$;
revoke execute on function public.reader_record_library_add(text) from public,anon;
grant execute on function public.reader_record_library_add(text) to authenticated;

-- Keep existing reward statistics and rank derivation intact.
create or replace function private.reader_my_progress()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_xp bigint; v_chapters integer; v_books integer;
 v_days integer; v_scifi integer; v_genres integer; v_title text; v_notified text;
 v_collected integer;
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
 select count(*) into v_collected from public.reader_verified_library where user_id=v_user;
 select equipped_title,notified_rank into v_title,v_notified
  from public.reader_title_selection where user_id=v_user;
 return jsonb_build_object(
  'total_xp',v_xp,'chapters',v_chapters,'completedNovels',v_books,'readingDays',v_days,
  'scifiNovels',v_scifi,'completedGenres',v_genres,'verifiedLibrary',v_collected,
  'selected_title',coalesce(v_title,'novice'),'last_rank_notified',v_notified,
  'level',public.reader_level_for_xp(v_xp),
  'rank',public.reader_rank_for_level(public.reader_level_for_xp(v_xp))
 );
end $$;
revoke execute on function private.reader_my_progress() from public,anon;
grant execute on function private.reader_my_progress() to authenticated;

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
  else false end;
 -- Reviewer remains locked until server-moderated reviews are available.
 if not v_ok then raise exception 'Title is not unlocked' using errcode='42501'; end if;
 insert into public.reader_title_selection(user_id,equipped_title)
  values(v_user,p_title)
  on conflict(user_id) do update set equipped_title=excluded.equipped_title,
    updated_at=clock_timestamp();
 return true;
end $$;
revoke execute on function private.reader_select_title(text) from public,anon;
grant execute on function private.reader_select_title(text) to authenticated;
