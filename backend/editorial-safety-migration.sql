-- Apply on the Hunmeng database only, after reviewing this PR and passing CI.
-- Existing jobs without an owner remain admin-only. Do not guess their creator.
begin;
alter table public.novel_translation_jobs
  add column if not exists owner_uid uuid references auth.users(id);
create index if not exists novel_jobs_owner on public.novel_translation_jobs(owner_uid, updated_at);

drop policy if exists novel_jobs_staff_read on public.novel_translation_jobs;
drop policy if exists novel_jobs_staff_insert on public.novel_translation_jobs;
drop policy if exists novel_jobs_staff_update on public.novel_translation_jobs;
-- A chapter is private to its editor until an administrator reviews it.
-- Orphaned legacy chapters (owner_uid IS NULL) remain admin-only.
create policy novel_jobs_staff_read on public.novel_translation_jobs for select to authenticated
  using (exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
    and (s.role = 'admin' or owner_uid = (select auth.uid()))));
create policy novel_jobs_staff_insert on public.novel_translation_jobs for insert to authenticated
  with check (owner_uid = (select auth.uid()) and
    exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())));
create policy novel_jobs_staff_update on public.novel_translation_jobs for update to authenticated
  using (exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
    and (s.role = 'admin' or owner_uid = (select auth.uid()))))
  with check (exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
    and (s.role = 'admin' or owner_uid = (select auth.uid()))));

create or replace function public.novel_guard_job()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  original public.novel_sources%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'review') then
      raise exception 'New chapters must start as draft or review';
    end if;
    if current_user <> 'service_role' then
      if auth.uid() is null then raise exception 'A staff session is required'; end if;
      if new.owner_uid is null then new.owner_uid := auth.uid(); end if;
      if new.owner_uid <> auth.uid() then raise exception 'The draft must belong to its creator'; end if;
    end if;
  else
    if current_user <> 'service_role' and new.owner_uid is distinct from old.owner_uid then
      raise exception 'Chapter ownership cannot be changed';
    end if;
    if old.status = 'published' then
      raise exception 'Published chapters are immutable';
    end if;
    if current_user <> 'service_role' and
       (new.reviewed_by is distinct from old.reviewed_by
        or new.approved_at is distinct from old.approved_at
        or new.published_at is distinct from old.published_at
        or new.publish_commit is distinct from old.publish_commit) then
      raise exception 'Approval and publication fields are server-managed';
    end if;

    if old.status = 'approved' and new.status in ('approved', 'review') and
       (new.source_id, new.chapter_number, new.chapter_slug, new.chapter_title,
        new.chapter_description, new.original_text, new.translated_text, new.qa_notes)
       is distinct from
       (old.source_id, old.chapter_number, old.chapter_slug, old.chapter_title,
        old.chapter_description, old.original_text, old.translated_text, old.qa_notes) then
      raise exception 'Approved content is immutable; return it to review before editing';
    end if;
    if new.status <> old.status then
      if old.status = 'draft' and new.status = 'review' then
        null;
      elsif old.status = 'review' and new.status = 'draft' then
        if not exists (select 1 from public.novel_staff
          where user_id = auth.uid() and role = 'admin') then
          raise exception 'Only administrators may return a review to draft';
        end if;
      elsif old.status = 'review' and new.status = 'approved' then
        null; -- Admin rights and QA are checked below.
      elsif old.status = 'approved' and new.status = 'review' then
        if not exists (select 1 from public.novel_staff
          where user_id = auth.uid() and role = 'admin') then
          raise exception 'Only administrators may revoke approval';
        end if;
        new.reviewed_by := null;
        new.approved_at := null;
      elsif old.status = 'approved' and new.status = 'published' then
        if current_user <> 'service_role' then
          raise exception 'Only the server publisher may publish';
        end if;
        if new.published_at is null or
           new.publish_commit !~ '^[0-9a-f]{40}$' then
          raise exception 'Publication metadata is required';
        end if;
      else
        raise exception 'This chapter status transition is not allowed';
      end if;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;

  if new.status = 'review' and (tg_op = 'INSERT' or old.status = 'draft') and
     (length(trim(new.original_text)) < 80 or length(trim(new.translated_text)) < 80
      or length(trim(new.chapter_description)) < 10) then
    raise exception 'Complete the chapter before sending for review';
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    if tg_op = 'INSERT' or old.status <> 'review' then
      raise exception 'Approval requires a reviewed chapter';
    end if;
    if not exists (select 1 from public.novel_staff
      where user_id = auth.uid() and role = 'admin') then
      raise exception 'Only administrators approve translations';
    end if;
    new.reviewed_by := auth.uid();
    new.approved_at := clock_timestamp();
  end if;

  if new.status in ('approved', 'published') and
     (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select * into original from public.novel_sources where id = new.source_id;
    if not found or original.rights_status <> 'verified' or not original.permission_translate
       or not original.permission_publish or original.verified_at is null
       or length(trim(coalesce(original.rights_evidence, ''))) < 20
       or (original.rights_valid_until is not null and original.rights_valid_until < current_date) then
      raise exception 'Publication rights not verified';
    end if;
    if length(trim(original.title_ru)) < 2 or length(trim(original.description_ru)) < 20 then
      raise exception 'Novel metadata incomplete';
    end if;
    if length(trim(new.original_text)) < 80 or length(trim(new.translated_text)) < 80
       or length(trim(new.chapter_description)) < 10
       or new.translated_text ~* '(^|[[:space:]])(TODO|TBD|PLACEHOLDER)([[:space:]]|$)'
       or length(trim(new.qa_notes)) < 20
       or new.reviewed_by is null or new.approved_at is null then
      raise exception 'Human review or QA failed';
    end if;
    if exists (select 1 from public.novel_terms t
      where t.source_id = new.source_id
        and position(lower(t.original_term) in lower(new.original_text)) > 0
        and position(lower(t.translated_term) in lower(new.translated_text)) = 0) then
      raise exception 'QA failed: missing glossary translation';
    end if;
  end if;
  return new;
end;
$$;
commit;
