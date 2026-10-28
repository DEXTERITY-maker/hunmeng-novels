-- Hunmeng moderated reader reviews. Additive; existing XP and user data remain unchanged.
-- A pending review never unlocks a title. Only independently approved reviews count.
create table if not exists public.reader_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  novel_slug text not null check (novel_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  body text not null check (char_length(body) between 120 and 4000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  moderated_at timestamptz,
  moderator_id uuid references auth.users(id),
  unique (user_id,novel_slug)
);
create index if not exists reader_reviews_moderation_queue
  on public.reader_reviews(status,created_at desc);
create index if not exists reader_reviews_published_by_novel
  on public.reader_reviews(novel_slug,created_at desc) where status='approved';
alter table public.reader_reviews enable row level security;
revoke all on public.reader_reviews from public,anon,authenticated;
-- Grant only displayable fields: user IDs and moderation details are never publicly returned.
-- Keep review author UUIDs private even from other authenticated readers.
grant select(id,novel_slug,body,status,created_at,updated_at)
  on public.reader_reviews to authenticated;
grant select(id,novel_slug,body,status,created_at)
  on public.reader_reviews to anon;
-- Administrative moderation can update STATUS only, never the authored text, owner or XP.
grant update(status) on public.reader_reviews to authenticated;
create policy reader_review_published on public.reader_reviews
  for select to anon,authenticated using (status='approved');
create policy reader_review_own on public.reader_reviews
  for select to authenticated using (user_id=(select auth.uid()));
create policy reader_review_admin_read on public.reader_reviews
  for select to authenticated using (exists (
    select 1 from public.novel_staff s where s.user_id=(select auth.uid()) and s.role='admin'
  ));
create policy reader_review_admin_moderate on public.reader_reviews
  for update to authenticated using (exists (
    select 1 from public.novel_staff s where s.user_id=(select auth.uid()) and s.role='admin'
  )) with check (exists (
    select 1 from public.novel_staff s where s.user_id=(select auth.uid()) and s.role='admin'
  ));

-- Server controls who may moderate and stamps the immutable moderation audit.
create or replace function private.reader_review_moderation_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_admin boolean;
begin
 select exists(select 1 from public.novel_staff s
  where s.user_id=auth.uid() and s.role='admin') into v_admin;
 if auth.uid() is null or not v_admin then
  raise exception 'Administrator review permission required' using errcode='42501';
 end if;
 if old.user_id=auth.uid() then
  raise exception 'Administrators cannot moderate their own reviews' using errcode='42501';
 end if;
 if new.status not in ('approved','rejected') then
  raise exception 'Only approval or rejection is allowed' using errcode='22023';
 end if;
 if new.status=old.status then return old; end if;
 new.updated_at:=clock_timestamp();
 new.moderated_at:=clock_timestamp();
 new.moderator_id:=auth.uid();
 return new;
end $$;
revoke execute on function private.reader_review_moderation_guard() from public,anon,authenticated;
drop trigger if exists reader_review_moderation_guard on public.reader_reviews;
create trigger reader_review_moderation_guard before update on public.reader_reviews
  for each row execute function private.reader_review_moderation_guard();

-- Revoking an approved review immediately retracts the Reviewer title if the
-- author drops below the verified threshold. Other titles and XP remain intact.
create or replace function private.reader_revoke_reviewer_title()
returns trigger language plpgsql security definer set search_path=''
as $
begin
 if old.status='approved' and new.status<>'approved' then
   update public.reader_title_selection
     set equipped_title='novice', updated_at=clock_timestamp()
   where user_id=new.user_id and equipped_title='reviewer'
     and (select count(*) from public.reader_reviews
          where user_id=new.user_id and status='approved') < 20;
 end if;
 return new;
end $;
revoke execute on function private.reader_revoke_reviewer_title() from public,anon,authenticated;
drop trigger if exists reader_revoke_reviewer_title on public.reader_reviews;
create trigger reader_revoke_reviewer_title after update of status on public.reader_reviews
  for each row execute function private.reader_revoke_reviewer_title();

-- Authenticated submission, one review per user/book. No client table writes.
-- A 24-hour rate limit and minimum distinct words reduce trivial reward farming.
create or replace function private.reader_submit_review(p_novel text,p_body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_text text; v_id uuid; v_words integer;
begin
 if v_user is null then raise exception 'Sign in before reviewing' using errcode='42501'; end if;
 if p_novel is null or length(p_novel)>120 or not exists(
   select 1 from public.reader_chapter_registry where novel_slug=p_novel
 ) then raise exception 'Novel is not eligible for reviews' using errcode='22023'; end if;
 v_text:=btrim(coalesce(p_body,''));
 v_words:=cardinality(regexp_split_to_array(v_text,E'\\s+'));
 if char_length(v_text) not between 120 and 4000 or v_words < 20 then
  raise exception 'Write a meaningful review (120-4000 characters, 20 words)' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,17));
 if exists(select 1 from public.reader_reviews
   where user_id=v_user and novel_slug=p_novel) then return null; end if;
 if (select count(*) from public.reader_reviews
    where user_id=v_user and created_at >= clock_timestamp()-interval '24 hours') >=3 then
   raise exception 'Review submission limit reached; try again later' using errcode='22023';
 end if;
 insert into public.reader_reviews(user_id,novel_slug,body)
   values (v_user,p_novel,v_text) returning id into v_id;
 return v_id;
end $$;
revoke execute on function private.reader_submit_review(text,text) from public,anon;
grant execute on function private.reader_submit_review(text,text) to authenticated;
create or replace function public.reader_submit_review(p_novel text,p_body text)
returns uuid language sql security invoker set search_path=''
as $$ select private.reader_submit_review(p_novel,p_body) $$;
revoke execute on function public.reader_submit_review(text,text) from public,anon;
grant execute on function public.reader_submit_review(text,text) to authenticated;

-- Authenticated readers may inspect only their own review status. A dedicated RPC
-- avoids granting SELECT(user_id) on approved reviews to every reader.
create or replace function private.reader_my_review_status(p_novel text)
returns text language plpgsql security definer set search_path=''
as $
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select r.status into v_status from public.reader_reviews r
   where r.user_id=v_user and r.novel_slug=p_novel;
 return v_status;
end $;
revoke execute on function private.reader_my_review_status(text) from public,anon;
grant execute on function private.reader_my_review_status(text) to authenticated;
create or replace function public.reader_my_review_status(p_novel text)
returns text language sql security invoker set search_path=''
as $ select private.reader_my_review_status(p_novel) $;
revoke execute on function public.reader_my_review_status(text) from public,anon;
grant execute on function public.reader_my_review_status(text) to authenticated;

-- Public view reveals only approved review content without account identities.
create or replace view public.reader_published_reviews
with (security_invoker=true) as
 select id,novel_slug,body,created_at
 from public.reader_reviews where status='approved';
revoke all on public.reader_published_reviews from public,anon,authenticated;
grant select on public.reader_published_reviews to anon,authenticated;

-- Extend the existing account metrics without changing any XP ledger.
create or replace function public.reader_my_progress()
returns jsonb language sql security invoker set search_path=''
as $$ select private.reader_my_progress() ||
 jsonb_build_object('achievement_dates',private.reader_achievement_dates(),
  'approvedReviews',(select count(*) from public.reader_reviews
    where user_id=(select auth.uid()) and status='approved')) $$;
revoke execute on function public.reader_my_progress() from public,anon;
grant execute on function public.reader_my_progress() to authenticated;

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
   else false end;
 if not v_ok then raise exception 'Title is not unlocked' using errcode='42501'; end if;
 insert into public.reader_title_selection(user_id,equipped_title)
   values (v_user,p_title)
   on conflict(user_id) do update set equipped_title=excluded.equipped_title,
      updated_at=clock_timestamp();
 return true;
end $$;
revoke execute on function private.reader_select_title(text) from public,anon;
grant execute on function private.reader_select_title(text) to authenticated;
