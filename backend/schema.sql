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
  unique (source_id, original_term)
);
create table if not exists public.novel_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.novel_sources(id) on delete cascade,
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

create policy novel_jobs_staff_read on public.novel_translation_jobs for select to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_jobs_staff_insert on public.novel_translation_jobs for insert to authenticated
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
create policy novel_jobs_staff_update on public.novel_translation_jobs for update to authenticated
  using (exists (select 1 from public.novel_staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.novel_staff where user_id = (select auth.uid())));
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
  new.updated_at := now();
  if tg_op = 'INSERT' and new.status not in ('draft','review') then
    raise exception 'New jobs must start as draft or review';
  end if;
  if tg_op = 'UPDATE' and new.status = 'published' and old.status <> 'published'
    and current_user <> 'service_role' then
    raise exception 'Only server publisher can publish';
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' and current_user <> 'service_role' then
    raise exception 'Published chapter is immutable';
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    if not exists (select 1 from public.novel_staff
      where user_id = auth.uid() and role = 'admin') then
      raise exception 'Only administrators approve translations';
    end if;
    select * into original from public.novel_sources where id = new.source_id;
    if original.rights_status <> 'verified' or not original.permission_translate
       or not original.permission_publish or original.verified_at is null
       or length(trim(coalesce(original.rights_evidence,''))) < 20
       or (original.rights_valid_until is not null and original.rights_valid_until < current_date) then
      raise exception 'Publication rights not verified';
    end if;
    if length(trim(new.original_text)) < 80 or length(trim(new.translated_text)) < 80
       or length(trim(new.chapter_description)) < 10 or length(new.chapter_description) > 200
       or new.translated_text ~* '(^|[[:space:]])(TODO|TBD|PLACEHOLDER)([[:space:]]|$)' then
      raise exception 'QA failed: incomplete text or missing description';
    end if;
    if exists (
      select 1 from public.novel_terms t
      where t.source_id = new.source_id
        and position(lower(t.original_term) in lower(new.original_text)) > 0
        and position(lower(t.translated_term) in lower(new.translated_text)) = 0
    ) then
      raise exception 'QA failed: missing glossary translation';
    end if;
    if length(trim(new.qa_notes)) < 20 then
      raise exception 'Human review notes required (at least 20 characters)';
    end if;
    new.reviewed_by := auth.uid();
    new.approved_at := now();
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
