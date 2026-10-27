-- Отдельная схема для Хунмэнг Новеллы. НЕ применять к чужому приложению без проверки.
-- Запускайте целиком в новом проекте Supabase; никакие разрешения не открываются по умолчанию.
create extension if not exists pgcrypto;

create table if not exists public.novel_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor')),
  created_at timestamptz not null default now()
);
create table if not exists public.novel_reader_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"version":1,"library":{},"progress":{}}'::jsonb
    check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 262144),
  updated_at timestamptz not null default now()
);
create table if not exists public.novel_sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  original_title text not null check (length(original_title) between 1 and 250),
  title_ru text not null default '' check (length(title_ru) <= 250),
  description_ru text not null default '' check (length(description_ru) <= 10000),
  genres text[] not null default array['Fantasy']::text[],
  tags text[] not null default array[]::text[],
  original_status text not null default 'Продолжается'
    check (original_status in ('Продолжается','Завершён','Приостановлен')),
  translation_status text not null default 'Переводится'
    check (translation_status in ('Переводится','Завершён','Приостановлен')),
  cover_path text not null default '/images/novel-placeholder.svg'
    check (cover_path ~ '^/images/[a-z0-9-]+\.(svg|webp|png|jpg)$'),
  original_url text not null check (original_url ~ '^https://'),
  author_name text not null default '',
  rights_status text not null default 'pending'
    check (rights_status in ('pending','verified','expired','revoked')),
  rights_evidence text,
  rights_valid_until date,
  permission_translate boolean not null default false,
  permission_publish boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_rights_proof check (
    rights_status <> 'verified' or (
      length(trim(coalesce(rights_evidence,''))) >= 20
      and verified_by is not null and verified_at is not null
      and permission_translate and permission_publish
    )
  )
);
create table if not exists public.novel_terms (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.novel_sources(id) on delete cascade,
  original_term text not null check (length(original_term) between 1 and 200),
  translated_term text not null check (length(translated_term) between 1 and 200),
  note text not null default '',
  term_type text not null default 'предмет' check (term_type in ('персонаж','место','техника','предмет')),
  unique (source_id, original_term)
);
create table if not exists public.novel_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.novel_sources(id) on delete cascade,
  owner_uid uuid references auth.users(id),
  chapter_number integer not null check (chapter_number between 1 and 1000000),
  chapter_slug text not null check (chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  chapter_title text not null check (length(chapter_title) between 1 and 200),
  chapter_description text not null default '' check (length(chapter_description) <= 200),
  original_text text not null default '' check (length(original_text) <= 300000),
  translated_text text not null default '' check (length(translated_text) <= 300000),
  status text not null default 'draft' check (status in ('draft','review','approved','published')),
  qa_notes text not null default '',
  reviewed_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  publish_commit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, chapter_number),
  unique (source_id, chapter_slug)
);
create table if not exists public.novel_publication_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.novel_translation_jobs(id) on delete cascade,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  published_at timestamptz not null default now(),
  unique (job_id, commit_sha)
);

create index if not exists novel_jobs_queue on public.novel_translation_jobs(status, approved_at)
  where status in ('approved','review');
create index if not exists novel_jobs_source on public.novel_translation_jobs(source_id, chapter_number);
create index if not exists novel_jobs_owner on public.novel_translation_jobs(owner_uid, updated_at);
create index if not exists novel_terms_source on public.novel_terms(source_id);

-- Все таблицы, открытые через API, защищаются RLS.
alter table public.novel_staff enable row level security;
alter table public.novel_reader_state enable row level security;
alter table public.novel_sources enable row level security;
alter table public.novel_terms enable row level security;
alter table public.novel_translation_jobs enable row level security;
alter table public.novel_publication_events enable row level security;

-- Права таблиц + RLS: anon не получает доступа к редакционным данным.
revoke all on public.novel_staff, public.novel_reader_state, public.novel_sources,
  public.novel_terms, public.novel_translation_jobs, public.novel_publication_events
  from anon, authenticated;
grant select on public.novel_staff to authenticated;
grant select, insert, update, delete on public.novel_reader_state to authenticated;
grant select, insert, update on public.novel_sources to authenticated;
grant select, insert, update, delete on public.novel_terms to authenticated;
grant select, insert, update on public.novel_translation_jobs to authenticated;
grant select on public.novel_publication_events to authenticated;
grant all on public.novel_staff, public.novel_reader_state, public.novel_sources,
  public.novel_terms, public.novel_translation_jobs, public.novel_publication_events to service_role;

create policy novel_staff_self on public.novel_staff for select to authenticated
  using (user_id = (select auth.uid()));

create policy novel_state_self_read on public.novel_reader_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy novel_state_self_insert on public.novel_reader_state for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy novel_state_self_update on public.novel_reader_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy novel_state_self_delete on public.novel_reader_state for delete to authenticated
  using (user_id = (select auth.uid()));

-- Роль берётся только из серверной таблицы novel_staff, НЕ из user_metadata.
create policy novel_source_staff_read on public.novel_sources for select to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_source_admin_insert on public.novel_sources for insert to authenticated
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid()) and role = 'admin'));
create policy novel_source_admin_update on public.novel_sources for update to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid()) and role = 'admin'));

create policy novel_terms_staff_read on public.novel_terms for select to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_terms_staff_insert on public.novel_terms for insert to authenticated
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_terms_staff_update on public.novel_terms for update to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_terms_staff_delete on public.novel_terms for delete to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));

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
create policy novel_publication_staff_read on public.novel_publication_events for select to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));

-- Финальное одобрение требует реального права публикации, человеческой вычитки
-- и базовых автоматических QA-условий; клиент не может объявить черновик "published".
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

create trigger novel_job_guard before insert or update on public.novel_translation_jobs
for each row execute function public.novel_guard_job();
revoke all on function public.novel_guard_job() from public, anon;

-- При верификации правообладателя поле verified_by заполняется админом, а не клиентом.
create or replace function public.novel_guard_source()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.rights_status = 'verified'
     and (tg_op = 'INSERT' or old.rights_status <> 'verified') then
    if not exists (select 1 from public.novel_staff
      where user_id = auth.uid() and role = 'admin') then
      raise exception 'Only administrator can verify rights';
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;
  return new;
end;
$$;
create trigger novel_source_guard before insert or update on public.novel_sources
for each row execute function public.novel_guard_source();
revoke all on function public.novel_guard_source() from public, anon;

-- Установка первого админа: ТОЛЬКО В SQL-редакторе проекта, с реальным auth.users.id:
-- insert into public.novel_staff (user_id, role) values ('<REAL_AUTH_USER_UUID>', 'admin');
