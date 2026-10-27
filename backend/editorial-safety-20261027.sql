-- Apply after reviewing the rollout. Existing jobs without an owner remain admin-only.
alter table public.novel_translation_jobs
  add column if not exists created_by uuid references auth.users(id);
create index if not exists novel_jobs_owner on public.novel_translation_jobs(created_by);

drop policy if exists novel_jobs_staff_read on public.novel_translation_jobs;
drop policy if exists novel_jobs_staff_insert on public.novel_translation_jobs;
drop policy if exists novel_jobs_staff_update on public.novel_translation_jobs;
-- Editors see and change only their own chapters. Administrators can work on all.
create policy novel_jobs_staff_read on public.novel_translation_jobs for select to authenticated
  using (exists (select 1 from public.novel_staff s
    where s.user_id = (select auth.uid()) and
      (s.role = 'admin' or created_by = (select auth.uid()))));
create policy novel_jobs_staff_insert on public.novel_translation_jobs for insert to authenticated
  with check (created_by = (select auth.uid()) and exists
    (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
      and s.role in ('editor','admin')));
create policy novel_jobs_staff_update on public.novel_translation_jobs for update to authenticated
  using (exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
    and (s.role = 'admin' or created_by = (select auth.uid()))))
  with check (exists (select 1 from public.novel_staff s where s.user_id = (select auth.uid())
    and (s.role = 'admin' or created_by = (select auth.uid()))));

create or replace function public.novel_guard_job()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  original public.novel_sources%rowtype;
  staff_role text;
begin
  new.updated_at := clock_timestamp();
  if current_user <> 'service_role' then
    select role into staff_role from public.novel_staff where user_id = auth.uid();
    if staff_role not in ('editor', 'admin') or staff_role is null then
      raise exception 'Editorial role required';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if current_user <> 'service_role' then new.created_by := auth.uid(); end if;
    if new.status not in ('draft', 'review') then
      raise exception 'New jobs must start as draft or review';
    end if;
  else
    if old.status = 'published' then raise exception 'Published chapter is immutable'; end if;
    if current_user <> 'service_role' and (
      new.created_by is distinct from old.created_by
      or new.published_at is distinct from old.published_at
      or new.publish_commit is distinct from old.publish_commit
      or new.reviewed_by is distinct from old.reviewed_by
      or new.approved_at is distinct from old.approved_at
    ) then
      raise exception 'Server-managed editorial fields cannot be changed';
    end if;

    if old.status = 'draft' and new.status not in ('draft', 'review') then
      raise exception 'Draft must be sent for review before approval';
    elsif old.status = 'review' and new.status not in ('draft', 'review', 'approved') then
      raise exception 'Invalid review transition';
    elsif old.status = 'approved' then
      if new.status = 'approved' then
        if (new.source_id, new.chapter_number, new.chapter_slug, new.chapter_title,
            new.chapter_description, new.original_text, new.translated_text, new.qa_notes)
           is distinct from
           (old.source_id, old.chapter_number, old.chapter_slug, old.chapter_title,
            old.chapter_description, old.original_text, old.translated_text, old.qa_notes) then
          raise exception 'Approved content is immutable; return it to review first';
        end if;
      elsif new.status = 'review' and staff_role = 'admin' then
        if (new.source_id, new.chapter_number, new.chapter_slug, new.chapter_title,
            new.chapter_description, new.original_text, new.translated_text, new.qa_notes)
           is distinct from
           (old.source_id, old.chapter_number, old.chapter_slug, old.chapter_title,
            old.chapter_description, old.original_text, old.translated_text, old.qa_notes) then
          raise exception 'Return to review before editing approved content';
        end if;
        new.reviewed_by := null;
        new.approved_at := null;
      elsif not (new.status = 'published' and current_user = 'service_role') then
        raise exception 'Only administrators can return approved chapters to review';
      end if;
    end if;
  end if;

  if new.status in ('review', 'approved', 'published') then
    if length(trim(new.original_text)) < 80 or length(trim(new.translated_text)) < 80
       or length(trim(new.chapter_description)) < 10 or
       new.translated_text ~* '(^|[[:space:]])(TODO|TBD|PLACEHOLDER)([[:space:]]|$)' then
      raise exception 'QA failed: complete source, translation and description before review';
    end if;
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    if staff_role <> 'admin' or staff_role is null then
      raise exception 'Only administrators approve translations';
    end if;
    select * into original from public.novel_sources where id = new.source_id;
    if original.rights_status <> 'verified' or not original.permission_translate
       or not original.permission_publish or original.verified_at is null
       or length(trim(coalesce(original.rights_evidence,''))) < 20
       or (original.rights_valid_until is not null and original.rights_valid_until < current_date) then
      raise exception 'Publication rights not verified';
    end if;
    if length(trim(original.title_ru)) < 2 or length(trim(original.description_ru)) < 20 then
      raise exception 'Novel metadata incomplete';
    end if;
    if exists (select 1 from public.novel_terms t where t.source_id = new.source_id
      and position(lower(t.original_term) in lower(new.original_text)) > 0
      and position(lower(t.translated_term) in lower(new.translated_text)) = 0) then
      raise exception 'QA failed: missing glossary translation';
    end if;
    if length(trim(new.qa_notes)) < 20 then
      raise exception 'Human review notes required';
    end if;
    new.reviewed_by := auth.uid();
    new.approved_at := clock_timestamp();
  end if;

  if new.status = 'published' then
    if tg_op <> 'UPDATE' or old.status <> 'approved' or current_user <> 'service_role' then
      raise exception 'Only publisher can publish approved chapters';
    end if;
    select * into original from public.novel_sources where id = new.source_id;
    if original.rights_status <> 'verified' or not original.permission_translate
       or not original.permission_publish or original.verified_at is null
       or length(trim(coalesce(original.rights_evidence,''))) < 20
       or (original.rights_valid_until is not null and original.rights_valid_until < current_date)
       or new.reviewed_by is null or new.approved_at is null
       or length(trim(new.qa_notes)) < 20
       or new.published_at is null
       or coalesce(new.publish_commit,'') !~ '^[0-9a-f]{40}$' then
      raise exception 'Publication is not authorized or complete';
    end if;
  end if;
  return new;
end;
$$;
