-- ============================================================================
-- DRAFT — NOT A MIGRATION, NOT APPLIED, NOT EXECUTED.
--
-- Reviewable SQL candidate for docs/novel-request-schema-proposal.md (PR #62).
--
-- Why it is not a generated Supabase migration:
--   the Supabase CLI is not installed in this environment and this repository
--   has no `supabase/` project directory. The instruction is explicit: do not
--   install the CLI, do not invent a migration name, and do not run SQL against
--   any database. This file therefore stays in docs as an explicitly marked
--   draft. After owner review it must be moved to
--   `supabase/migrations/<cli-generated-name>.sql` and applied only in a
--   separate, disposable staging project.
--
-- Status: static draft. NOT verified against a running Postgres. Static review
-- does not prove migration correctness, trigger semantics or RLS behaviour.
--
-- Scope:
--   * additive structures on NEW request_* tables only;
--   * NO trigger, policy, grant or column change on existing tables
--     (novel_sources, novel_translation_jobs, novel_staff, reader_* are read
--     only, and only through links/joins);
--   * no adapters, no network calls, no server functions implemented here;
--     write paths are documented as TODO signatures at the bottom;
--   * access stays closed by default: no grants to anon/authenticated except
--     two explicitly reviewed read projections;
--   * numbers, retention and role names in comments are preliminary and
--     pending owner approval.
-- ============================================================================

create schema if not exists private;

-- ----------------------------------------------------------------------------
-- 0. Security model for this candidate (pending verification).
--
--   anon           : no access at all to request tables/views.
--   authenticated  : SELECT on public.request_owner_view (own rows only) and
--                    public.request_staff_view (novel_staff only). Both views
--                    are owned by the migration owner role and their WHERE
--                    clauses are the security boundary. No DML.
--   service_role   : server jobs. SELECT on request tables, EXECUTE on the
--                    diagnostic function only. NO INSERT/UPDATE/DELETE on
--                    audit tables. Real writes are expected to happen inside
--                    SECURITY DEFINER functions owned by the table owner.
--   table owner    : owns tables/functions; can bypass triggers with DDL. This
--                    is a documented exception, not a guarantee (see docs §6).
--   superuser      : bypasses everything; out of scope of the guarantees.
--
--   A dedicated `request_owner` role creation is NOT included here: creating
--   roles requires owner/superuser approval. Until that decision is made,
--   functions would be owned by the migration role and access stays closed.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Request-side work identity (temporary staging concept; novel_sources stays
--    the editorial canonical record).
-- ----------------------------------------------------------------------------
create table public.request_works (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null check (length(btrim(canonical_title)) between 1 and 250),
  canonical_author text not null default '' check (length(canonical_author) <= 250),
  normalized_title text not null check (length(btrim(normalized_title)) between 1 and 250),
  normalized_author text not null default '',
  state text not null default 'proposed'
    check (state in ('proposed', 'confirmed', 'converted', 'rejected')),
  -- Link only; editorial data is never duplicated into request tables.
  novel_source_id uuid references public.novel_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_works_converted_needs_source
    check (state <> 'converted' or novel_source_id is not null)
);
-- A novel_sources row may be linked by at most one request-side work, so a
-- second request for the same source must reuse the existing work (no duplicate
-- novel_sources, no duplicate work).
create unique index request_works_one_source
  on public.request_works (novel_source_id)
  where novel_source_id is not null;
create index request_works_state on public.request_works (state);

create table public.request_work_titles (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.request_works(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 250),
  language text not null default 'und'
    check (language = 'und' or language ~ '^[a-z]{2,3}$'),
  normalized_title text not null check (length(btrim(normalized_title)) between 1 and 250),
  kind text not null default 'alias' check (kind in ('original', 'alias', 'translated')),
  created_at timestamptz not null default now(),
  unique (work_id, normalized_title)
);

create table public.request_work_authors (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.request_works(id) on delete restrict,
  author_name text not null check (length(btrim(author_name)) between 1 and 250),
  normalized_author text not null check (length(btrim(normalized_author)) between 1 and 250),
  created_at timestamptz not null default now(),
  unique (work_id, normalized_author)
);

-- ----------------------------------------------------------------------------
-- 2. External source identity. (provider, external_id) is the uniqueness anchor
--    for "the same source".
-- ----------------------------------------------------------------------------
create table public.request_external_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  external_id text not null check (length(external_id) between 1 and 128),
  canonical_url text not null
    check (canonical_url ~ '^https://' and length(canonical_url) <= 2048),
  host text not null check (length(host) between 1 and 253),
  work_id uuid references public.request_works(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index request_external_sources_work on public.request_external_sources (work_id);

-- ----------------------------------------------------------------------------
-- 3. The request. No client writes: creation only through a future SECURITY
--    DEFINER function.
-- ----------------------------------------------------------------------------
create table public.novel_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete set null,
  requester_ref text not null check (requester_ref ~ '^[0-9a-f]{64}$'),
  submitted_url text not null
    check (submitted_url ~ '^https://' and length(submitted_url) <= 2048),
  external_source_id uuid not null
    references public.request_external_sources(id) on delete restrict,
  work_id uuid references public.request_works(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'review', 'needs_rights', 'draft', 'converted', 'rejected')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  client_note text not null default '' check (length(client_note) <= 2000),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_ref, idempotency_key)
);

create unique index novel_requests_active_source
  on public.novel_requests (requester_ref, external_source_id)
  where status in ('submitted', 'review', 'needs_rights', 'draft');
create index novel_requests_queue
  on public.novel_requests (status, created_at)
  where status in ('submitted', 'review', 'needs_rights');
create index novel_requests_requester
  on public.novel_requests (requester_ref, created_at desc);
create index novel_requests_work on public.novel_requests (work_id);
create index novel_requests_external_source on public.novel_requests (external_source_id);

create table public.request_client_hints (
  request_id uuid primary key references public.novel_requests(id) on delete restrict,
  source text not null default 'requester' check (source = 'requester'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create table public.request_adapter_metadata (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.novel_requests(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  adapter_version text not null check (length(btrim(adapter_version)) between 1 and 64),
  policy_id text not null check (length(btrim(policy_id)) between 1 and 128),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  provenance text not null check (length(btrim(provenance)) between 1 and 500),
  obtained_at timestamptz not null default now()
);
create index request_adapter_metadata_request on public.request_adapter_metadata (request_id);

-- ----------------------------------------------------------------------------
-- 4. Advisory match evidence. Append-only; never merges works by itself.
-- ----------------------------------------------------------------------------
create table public.request_match_evidence (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.novel_requests(id) on delete restrict,
  kind text not null check (kind in ('exact', 'probable')),
  matched_work_id uuid references public.request_works(id) on delete restrict,
  matched_source_id uuid references public.novel_sources(id) on delete restrict,
  score numeric(5, 4) not null default 0 check (score >= 0 and score <= 1),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  algorithm_version text not null check (length(btrim(algorithm_version)) between 1 and 64),
  catalog_version text not null default '',
  created_at timestamptz not null default now(),
  constraint request_match_evidence_target
    check (matched_work_id is not null or matched_source_id is not null)
);
create index request_match_evidence_request
  on public.request_match_evidence (request_id, created_at);

-- ----------------------------------------------------------------------------
-- 5. Append-only moderation history. RESTRICT keeps audit rows alive.
-- ----------------------------------------------------------------------------
create table public.request_moderation_decisions (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.novel_requests(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_ref text not null check (actor_ref ~ '^[0-9a-f]{64}$'),
  actor_role text not null check (actor_role in ('editor', 'admin', 'system')),
  from_status text not null,
  to_status text not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  request_version integer not null check (request_version >= 1),
  decided_at timestamptz not null default now()
);
create index request_moderation_decisions_request
  on public.request_moderation_decisions (request_id, decided_at);

-- ----------------------------------------------------------------------------
-- 6. Draft. It holds NO authoritative rights:
--      * before conversion there is no novel_sources row at all, therefore
--        rights are unverified by definition; the request layer only records
--        that documentation exists (rights_documentation_state);
--      * after conversion the only authoritative rights record is
--        public.novel_sources, read at query time (views) and re-checked by the
--        existing novel_guard_job at approval/publish time.
--    `request_blocked` is a request-layer hold only. It is not evidence of
--    permission and does not make anything publishable.
-- ----------------------------------------------------------------------------
create table public.request_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.novel_requests(id) on delete restrict,
  work_id uuid references public.request_works(id) on delete restrict,
  source_url text not null
    check (source_url ~ '^https://' and length(source_url) <= 2048),
  permitted_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permitted_metadata) = 'object'),
  rights_documentation_state text not null default 'none'
    check (rights_documentation_state in ('none', 'documented', 'expired', 'revoked')),
  rights_evidence_id uuid,
  converted_source_id uuid references public.novel_sources(id) on delete restrict,
  request_blocked boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_ref text check (created_by_ref is null or created_by_ref ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOTE: deliberately NOT unique on converted_source_id. Several requests may be
-- converted to the same existing novel_sources/work; duplicates of novel_sources
-- must never be created to work around uniqueness.

-- ----------------------------------------------------------------------------
-- 7. Private rights evidence: no grants to anon/authenticated at all.
-- ----------------------------------------------------------------------------
create table private.request_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.novel_requests(id) on delete restrict,
  evidence_text text not null check (length(btrim(evidence_text)) >= 20),
  stored_by uuid references auth.users(id) on delete set null,
  stored_by_ref text not null check (stored_by_ref ~ '^[0-9a-f]{64}$'),
  stored_at timestamptz not null default now(),
  valid_until date
);
create index request_rights_evidence_request
  on private.request_rights_evidence (request_id);

alter table public.request_drafts
  add constraint request_drafts_rights_evidence_fk
  foreign key (rights_evidence_id) references private.request_rights_evidence(id)
  on delete restrict;

-- ----------------------------------------------------------------------------
-- 8. Optional rate-limit counters (preliminary mechanism; numbers pending).
-- ----------------------------------------------------------------------------
create table public.request_rate_counters (
  bucket_key text not null check (length(bucket_key) between 1 and 200),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (bucket_key, window_start)
);

-- ----------------------------------------------------------------------------
-- 9. RLS, grants and projections. Closed by default.
-- ----------------------------------------------------------------------------
alter table public.request_works enable row level security;
alter table public.request_work_titles enable row level security;
alter table public.request_work_authors enable row level security;
alter table public.request_external_sources enable row level security;
alter table public.novel_requests enable row level security;
alter table public.request_client_hints enable row level security;
alter table public.request_adapter_metadata enable row level security;
alter table public.request_match_evidence enable row level security;
alter table public.request_moderation_decisions enable row level security;
alter table public.request_drafts enable row level security;
alter table public.request_rate_counters enable row level security;

revoke all on public.request_works, public.request_work_titles,
  public.request_work_authors, public.request_external_sources,
  public.novel_requests, public.request_client_hints,
  public.request_adapter_metadata, public.request_match_evidence,
  public.request_moderation_decisions, public.request_drafts,
  public.request_rate_counters
  from anon, authenticated, public, service_role;
revoke all on private.request_rights_evidence from anon, authenticated, public, service_role;

-- service_role: read-only for jobs + diagnostic function; no DML on audit.
grant select on public.request_works, public.request_work_titles,
  public.request_work_authors, public.request_external_sources,
  public.novel_requests, public.request_client_hints,
  public.request_adapter_metadata, public.request_match_evidence,
  public.request_moderation_decisions, public.request_drafts,
  public.request_rate_counters to service_role;
-- Private rights evidence remains inaccessible by direct grants. A future
-- audited admin-only function must be designed and tested before any access.

-- Owner projection: only the requester's own request. The view is owned by the
-- migration owner role and runs with the owner's rights; the WHERE clause is the
-- security boundary and must be covered by role tests in staging. Effective
-- rights for a converted draft are read from novel_sources at query time, not
-- from a cached request-layer flag.
create view public.request_owner_view
with (security_invoker = false) as
select
  r.id,
  r.status,
  r.created_at,
  r.updated_at,
  e.host as source_host,
  d.rights_documentation_state,
  d.request_blocked,
  (d.converted_source_id is not null) as converted,
  s.rights_status as source_rights_status,
  s.rights_valid_until as source_rights_valid_until,
  -- Advisory only. Publication authority remains novel_guard_job.
  (s.rights_status = 'verified'
   and s.permission_translate
   and s.permission_publish
   and s.verified_by is not null
   and s.verified_at is not null
   and length(btrim(coalesce(s.rights_evidence, ''))) >= 20
   and (s.rights_valid_until is null or s.rights_valid_until >= current_date)) as advisory_source_rights_look_complete,
  coalesce((
    select jsonb_agg(jsonb_build_object('kind', me.kind, 'reasons', me.reasons))
    from public.request_match_evidence me
    where me.request_id = r.id
  ), '[]'::jsonb) as matches
from public.novel_requests r
join public.request_external_sources e on e.id = r.external_source_id
left join public.request_drafts d on d.request_id = r.id
left join public.novel_sources s on s.id = d.converted_source_id
where r.requester_id = auth.uid();
revoke all on public.request_owner_view from anon, public;
grant select on public.request_owner_view to authenticated;

-- Staff projection: only for a novel_staff row. Role comes from the table,
-- never from JWT metadata. Rights are joined from the authoritative record.
create view public.request_staff_view
with (security_invoker = false) as
select
  r.id,
  r.status,
  r.requester_ref,
  r.submitted_url,
  r.created_at,
  r.updated_at,
  r.version,
  e.provider,
  e.external_id,
  e.host,
  r.work_id,
  d.id as draft_id,
  d.rights_documentation_state,
  d.request_blocked,
  d.converted_source_id,
  s.rights_status as source_rights_status,
  s.rights_valid_until as source_rights_valid_until,
  (s.id is not null) as has_editorial_source
from public.novel_requests r
join public.request_external_sources e on e.id = r.external_source_id
left join public.request_drafts d on d.request_id = r.id
left join public.novel_sources s on s.id = d.converted_source_id
where exists (
  select 1 from public.novel_staff st
  where st.user_id = auth.uid() and st.role in ('editor', 'admin')
);
revoke all on public.request_staff_view from anon, public;
grant select on public.request_staff_view to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Integrity guards on NEW tables only (no trigger on existing tables).
--     Deferred constraint triggers check cross-table links at COMMIT, so the
--     conversion transaction can update several rows in any order.
--     Related source/work updates also trigger checks. Source/request checks
--     serialize by source ID; other concurrency scenarios are not yet proven.
--     Future write functions need reviewed lock ordering and multi-session tests.
-- ----------------------------------------------------------------------------
create or replace function private.request_links_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.novel_requests%rowtype;
  src_work uuid;
  work_source uuid;
  work_state text;
  draft_work uuid;
  draft_source uuid;
begin
  -- This trigger is attached to novel_requests, whose primary key is id.
  -- Read the current row so deferred checks see the final transaction state.
  select * into req from public.novel_requests where id = new.id;
  if not found then return new; end if;

  -- Serialize the source/request invariant across concurrent transactions.
  -- Take the same transaction-scoped lock as the source update trigger before
  -- reading the related source; collisions only serialize unrelated sources.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-source:' || req.external_source_id::text, 0)
  );

  select work_id into src_work
    from public.request_external_sources where id = req.external_source_id;
  if req.work_id is not null and src_work is distinct from req.work_id then
    raise exception 'External source is not linked to the request work';
  end if;

  select work_id, converted_source_id into draft_work, draft_source
    from public.request_drafts where request_id = req.id;
  if draft_work is not null and draft_work is distinct from req.work_id then
    raise exception 'Draft work differs from request work';
  end if;
  if draft_source is not null then
    select novel_source_id into work_source from public.request_works where id = req.work_id;
    if work_source is distinct from draft_source then
      raise exception 'Draft source differs from the work source';
    end if;
  end if;

  if req.status = 'converted' then
    if req.work_id is null then
      raise exception 'Converted request must have a work';
    end if;
    select novel_source_id, state into work_source, work_state from public.request_works where id = req.work_id;
    if work_state is distinct from 'converted' or draft_source is null or work_source is distinct from draft_source then
      raise exception 'Conversion links request, work and novel_sources inconsistently';
    end if;
  end if;
  return new;
end;
$$;

create constraint trigger request_links_check_request
after insert or update of status, work_id, external_source_id on public.novel_requests
deferrable initially deferred
for each row execute function private.request_links_check();

create or replace function private.request_draft_links_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.novel_requests%rowtype;
  current_draft public.request_drafts%rowtype;
  work_source uuid;
begin
  -- A deferred trigger may run after several updates to the same draft. Check
  -- its final row, not the snapshot captured by an intermediate update.
  select * into current_draft from public.request_drafts where id = new.id;
  if not found then return new; end if;
  select * into req from public.novel_requests where id = current_draft.request_id;
  if current_draft.work_id is not null and req.work_id is distinct from current_draft.work_id then
    raise exception 'Draft work differs from request work';
  end if;
  if current_draft.converted_source_id is not null then
    select novel_source_id into work_source from public.request_works where id = req.work_id;
    if work_source is distinct from current_draft.converted_source_id then
      raise exception 'Draft source differs from the work source';
    end if;
  end if;
  return new;
end;
$$;

create constraint trigger request_draft_links_check
after insert or update of work_id, converted_source_id on public.request_drafts
deferrable initially deferred
for each row execute function private.request_draft_links_check();

-- Recheck requests when a source is reassigned, including updates which do not
-- touch the requests themselves. Evaluate final state when the transaction ends.
create or replace function private.request_external_source_links_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-source:' || new.id::text, 0)
  );
  if exists (
    select 1 from public.novel_requests r
    join public.request_external_sources e on e.id = r.external_source_id
    where e.id = new.id and r.work_id is not null and r.work_id is distinct from e.work_id
  ) then
    raise exception 'External source is not linked to the request work';
  end if;
  return new;
end;
$$;

create constraint trigger request_external_source_links_check
after update of work_id on public.request_external_sources
deferrable initially deferred
for each row execute function private.request_external_source_links_check();

-- Changing a work can invalidate already linked drafts or converted requests.
create or replace function private.request_work_links_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.request_works w
    join public.novel_requests r on r.work_id = w.id
    left join public.request_drafts d on d.request_id = r.id
    where w.id = new.id and (
      (d.converted_source_id is not null and d.converted_source_id is distinct from w.novel_source_id)
      or (r.status = 'converted' and (w.state <> 'converted' or d.converted_source_id is null
          or d.converted_source_id is distinct from w.novel_source_id))
    )
  ) then
    raise exception 'Work change conflicts with linked request or draft';
  end if;
  return new;
end;
$$;

create constraint trigger request_work_links_check
after update of state, novel_source_id on public.request_works
deferrable initially deferred
for each row execute function private.request_work_links_check();

-- Converted draft link is immutable; request-layer documentation state is not
-- an authoritative rights status and cannot be used to bypass editorial checks.
create or replace function private.request_draft_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.converted_source_id is not null
     and new.converted_source_id is distinct from old.converted_source_id then
    raise exception 'Converted draft link is immutable';
  end if;
  return new;
end;
$$;

create trigger request_drafts_guard
before update on public.request_drafts
for each row execute function private.request_draft_guard();

-- ----------------------------------------------------------------------------
-- 11. Append-only audit: observable guarantees and documented exceptions.
--     These triggers stop ordinary UPDATE/DELETE. They permit only the narrow
--     FK-driven removal of an actor's user ID when that auth user is deleted;
--     pseudonymous refs and all other audit fields remain unchanged. The table
--     owner (and any role with DDL rights or
--     superuser) can disable/alter triggers; that is a documented exception, not
--     a claim of cryptographic immutability. Use an external audit trail if the
--     threat model includes privileged DB roles.
-- ----------------------------------------------------------------------------
create or replace function private.request_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_column text;
  old_user uuid;
begin
  -- ON DELETE SET NULL on auth.users performs a nested referential action.
  -- No UPDATE is allowed unless it only clears the relevant user ID and the
  -- referenced user is no longer visible. Never clear the pseudonymous ref.
  if tg_op = 'UPDATE' and pg_catalog.pg_trigger_depth() > 1 then
    if tg_table_schema = 'public' and tg_table_name = 'request_moderation_decisions' then
      user_column := 'actor_id';
    elsif tg_table_schema = 'private' and tg_table_name = 'request_rights_evidence' then
      user_column := 'stored_by';
    end if;
    if user_column is not null then
      old_user := (pg_catalog.to_jsonb(old) ->> user_column)::uuid;
      if old_user is not null
         and (pg_catalog.to_jsonb(new) ->> user_column) is null
         and (pg_catalog.to_jsonb(new) - user_column) = (pg_catalog.to_jsonb(old) - user_column)
         and not exists (select 1 from auth.users where id = old_user) then
        return new;
      end if;
    end if;
  end if;
  raise exception 'Append-only audit row cannot be % (except by documented privileged maintenance)', tg_op;
end;
$$;

create trigger request_decisions_immutable
before update or delete on public.request_moderation_decisions
for each row execute function private.request_audit_immutable();
create trigger request_match_evidence_immutable
before update or delete on public.request_match_evidence
for each row execute function private.request_audit_immutable();
create trigger request_rights_evidence_immutable
before update or delete on private.request_rights_evidence
for each row execute function private.request_audit_immutable();
create trigger request_client_hints_immutable
before update or delete on public.request_client_hints
for each row execute function private.request_audit_immutable();
create trigger request_adapter_metadata_immutable
before update or delete on public.request_adapter_metadata
for each row execute function private.request_audit_immutable();

-- ----------------------------------------------------------------------------
-- 12. Drift report. Zero rows expected in a healthy system.
--     Note: request_works(novel_source_id) uniqueness is already enforced by a
--     unique index, so the report does not pretend to detect it with a group-by
--     count over a single-row work. It checks link consistency that only
--     multi-row queries can see.
-- ----------------------------------------------------------------------------
create or replace function public.request_consistency_report()
returns table (issue text, request_id uuid, work_id uuid, source_id uuid)
language sql
security definer
set search_path = ''
as $$
  select 'draft_source_differs_from_work'::text, r.id, r.work_id, d.converted_source_id
    from public.novel_requests r
    join public.request_drafts d on d.request_id = r.id
    join public.request_works w on w.id = r.work_id
   where d.converted_source_id is not null
     and w.novel_source_id is distinct from d.converted_source_id
  union all
  select 'converted_without_draft_link'::text, r.id, r.work_id, null::uuid
    from public.novel_requests r
   where r.status = 'converted'
     and not exists (
       select 1 from public.request_drafts d
        where d.request_id = r.id and d.converted_source_id is not null
     )
  union all
  select 'converted_request_work_not_converted'::text, r.id, r.work_id, null::uuid
    from public.novel_requests r
    join public.request_works w on w.id = r.work_id
   where r.status = 'converted' and w.state <> 'converted'
  union all
  select 'external_source_work_mismatch'::text, r.id, r.work_id, null::uuid
    from public.novel_requests r
    join public.request_external_sources e on e.id = r.external_source_id
   where r.work_id is not null and e.work_id is distinct from r.work_id;
$$;
revoke all on function public.request_consistency_report() from anon, authenticated, public;
grant execute on function public.request_consistency_report() to service_role;

-- ----------------------------------------------------------------------------
-- 13. Server functions: NOT IMPLEMENTED in this candidate.
--
-- These write paths are absent on purpose. They must be implemented and reviewed
-- server-side (SECURITY DEFINER, `set search_path = ''`, parameter allow-lists,
-- rate limits, audit writes, explicit transaction boundaries). Signatures are
-- recorded so the SQL candidate and the server contract stay aligned:
--
-- private.request_create(p_url text, p_note text, p_idempotency_key text,
--                        p_client_hints jsonb) returns jsonb
--   - auth.uid() required; derive requester_ref; enforce rate limits;
--   - recognize the URL only through an enabled adapter (none in this phase);
--   - upsert request_external_sources on (provider, external_id);
--   - compute request_fingerprint server-side; same key + same fingerprint ->
--     return the existing request; same key + different fingerprint -> conflict;
--   - insert novel_requests (status submitted, version 1), hints, adapter
--     metadata and match evidence; never accept status/source/work/rights from
--     the caller.
--
-- private.request_decide(p_request uuid, p_to text, p_reason text,
--                         p_expected_version integer) returns jsonb
--   - lock request FOR UPDATE; actor from novel_staff (editor/admin);
--   - validate the structural transition (same table as docs/prototype);
--   - reject when version <> p_expected_version (409 semantics);
--   - insert append-only decision; update status/version; create the draft on
--     review -> draft with rights_documentation_state='none', request_blocked=true.
--
-- private.request_document_rights(p_request uuid, p_evidence text,
--                                  p_valid_until date) returns jsonb
--   - admin only, pre-conversion only; writes private evidence and sets
--     rights_documentation_state='documented'; it NEVER turns rights into
--     "verified" and never unblocks publication, because only novel_sources can.
--
-- private.request_convert(p_request uuid, p_source uuid,
--                          p_expected_version integer) returns jsonb
--   - admin only, one transaction: lock request; require status='draft';
--     require work and external source linked to it; require novel_sources row;
--     reuse an existing work link if it already points to the same source
--     (several requests for one source are allowed, duplicates are not);
--     set request.status='converted', work.state='converted',
--     work.novel_source_id, draft.converted_source_id, request_blocked=false,
--     bump version, insert decision.
--   - conversion does not verify rights and does not publish anything.
--
-- Unresolved issues (owner decisions, docs §12):
--   * dedicated request_owner role vs migration-role ownership for views and
--     SECURITY DEFINER functions (until decided, access stays closed);
--   * final retention policy and whether privileged hard deletion is allowed;
--   * rate-limit numbers, account requirement, adapter allowlist;
--   * whether conversion is allowed while rights are still pending (proposal: yes);
--   * staging role tests for the two owner-rights views.
-- ============================================================================
