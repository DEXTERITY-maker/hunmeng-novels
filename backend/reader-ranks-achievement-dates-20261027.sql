-- Achievement dates are computed only from the server's immutable award log.
create or replace function private.reader_achievement_dates()
returns jsonb language sql stable security invoker set search_path=''
as $$
 select jsonb_build_object(
  'first-chapter', (select e.awarded_at from public.reader_xp_events e
    where e.user_id=(select auth.uid()) and e.event_kind='chapter_finished'
    order by e.awarded_at,e.id limit 1),
  'ten-chapters', (select e.awarded_at from public.reader_xp_events e
    where e.user_id=(select auth.uid()) and e.event_kind='chapter_finished'
    order by e.awarded_at,e.id limit 1 offset 9),
  'hundred-chapters', (select e.awarded_at from public.reader_xp_events e
    where e.user_id=(select auth.uid()) and e.event_kind='chapter_finished'
    order by e.awarded_at,e.id limit 1 offset 99),
  'thirty-days', (select case when count(*)=30 then max(d.day) else null end
    from (select distinct date_trunc('day',e.awarded_at) as day
      from public.reader_xp_events e
      where e.user_id=(select auth.uid()) and e.event_kind='chapter_finished'
      order by day limit 30) d),
  'ten-worlds', (select e.awarded_at from public.reader_xp_events e
    where e.user_id=(select auth.uid()) and e.event_kind='novel_finished'
    order by e.awarded_at,e.id limit 1 offset 9)
 )
$$;
revoke execute on function private.reader_achievement_dates() from public,anon;
grant execute on function private.reader_achievement_dates() to authenticated;
create or replace function public.reader_my_progress()
returns jsonb language sql security invoker set search_path=''
as $$ select private.reader_my_progress() ||
 jsonb_build_object('achievement_dates', private.reader_achievement_dates()) $$;
revoke execute on function public.reader_my_progress() from public,anon;
grant execute on function public.reader_my_progress() to authenticated;
