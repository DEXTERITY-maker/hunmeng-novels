-- Post-migration hardening: privileged reward implementations live outside
-- the exposed Data API. Public RPC wrappers use caller privileges.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated;

alter function public.reader_begin_chapter(text,text) set schema private;
alter function public.reader_finish_chapter(uuid) set schema private;
alter function public.reader_my_progress() set schema private;
alter function public.reader_select_title(text) set schema private;
alter function public.reader_mark_rank_seen(text) set schema private;

revoke execute on function private.reader_begin_chapter(text,text) from public,anon;
revoke execute on function private.reader_finish_chapter(uuid) from public,anon;
revoke execute on function private.reader_my_progress() from public,anon;
revoke execute on function private.reader_select_title(text) from public,anon;
revoke execute on function private.reader_mark_rank_seen(text) from public,anon;
grant execute on function private.reader_begin_chapter(text,text),
  private.reader_finish_chapter(uuid),private.reader_my_progress(),
  private.reader_select_title(text),private.reader_mark_rank_seen(text)
  to authenticated;

create function public.reader_begin_chapter(p_novel text,p_chapter text)
returns uuid language sql security invoker set search_path=''
as $$ select private.reader_begin_chapter(p_novel,p_chapter) $$;
create function public.reader_finish_chapter(p_session uuid)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_finish_chapter(p_session) $$;
create function public.reader_my_progress()
returns jsonb language sql security invoker set search_path=''
as $$ select private.reader_my_progress() $$;
create function public.reader_select_title(p_title text)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_select_title(p_title) $$;
create function public.reader_mark_rank_seen(p_rank text)
returns boolean language sql security invoker set search_path=''
as $$ select private.reader_mark_rank_seen(p_rank) $$;
revoke execute on function public.reader_begin_chapter(text,text) from public,anon;
revoke execute on function public.reader_finish_chapter(uuid) from public,anon;
revoke execute on function public.reader_my_progress() from public,anon;
revoke execute on function public.reader_select_title(text) from public,anon;
revoke execute on function public.reader_mark_rank_seen(text) from public,anon;
grant execute on function public.reader_begin_chapter(text,text),
  public.reader_finish_chapter(uuid),public.reader_my_progress(),
  public.reader_select_title(text),public.reader_mark_rank_seen(text) to authenticated;

-- Reading sessions deliberately offer no table rights to clients.
-- A scoped SELECT policy documents ownership as defense in depth.
create policy reader_sessions_self_read on public.reader_chapter_sessions
  for select to authenticated using (user_id=(select auth.uid()));
