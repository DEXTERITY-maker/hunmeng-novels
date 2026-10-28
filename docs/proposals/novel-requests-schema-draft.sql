-- ============================================================================
-- DRAFT — NOT A MIGRATION, NOT APPLIED, NOT EXECUTED.
--
-- This file is a reviewable SQL candidate for the proposal in
-- docs/novel-request-schema-proposal.md (PR #62).
--
-- Why it is not a generated Supabase migration:
--   the Supabase CLI is not installed in this environment and this repository
--   has no `supabase/` project directory. The instruction is explicit: do not
--   install the CLI, do not invent a migration name, and do not run SQL against
--   any database. Therefore this SQL lives in docs as an explicitly marked
--   draft. After owner review and a green light, it must be moved to
--   `supabase/migrations/<cli-generated-name>.sql` using the CLI and applied
--   only in a separate staging project.
--
-- Status: static draft. NOT verified against a running Postgres.
-- Static review does not prove migration correctness, RLS behaviour or trigger
-- semantics. A staging transaction test and RLS role tests are still required.
--
-- Scope:
--   * additive structures, indexes, checks, RLS enablement and projections only;
--   * no changes to existing tables, existing RLS policies, grants of the
--     editorial tables, reader_* tables or XP;
--   * no adapters, no network calls, no server functions implemented here:
--     write paths are documented as TODO stubs only (see the bottom section);
--   * values in comments (limits, retention) are preliminary, not approved.
-- ============================================================================

create schema if not exists private;

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
  novel_source_id uuid references public.novel_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_works_converted_needs_source
    check (state <> 'converted' or novel_source_id is not null)
);

-- One work can be converted into at most one editorial source.
create unique index request_works_one_source
  on public.request_works (novel_source_id)
  where novel_source_id is not null;
create index request_works_state on public.request_works (state);

-- Alternative, translated and original titles. Created by a moderator decision,
-- never by automatic merging.
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

-- Author spelling variants. An author match alone is never an exact identity.
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
--    for "the same source"; raw user input is never stored here as canonical.
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
-- 3. The request. No client writes: INSERT/UPDATE/DELETE are revoked below and
--    creation happens only through a SECURITY DEFINER server function (TODO).
-- ----------------------------------------------------------------------------
create table public.novel_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete set null,
  -- Immutable pseudonymous reference, so audit survives user deletion.
  requester_ref text not null check (requester_ref ~ '^[0-9a-f]{64}$'),
  submitted_url text not null
    check (submitted_url ~ '^https://' and length(submitted_url) <= 2048),
  external_source_id uuid not null
    references public.request_external_sources(id) on delete restrict,
  work_id uuid references public.request_works(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'review', 'needs_rights', 'draft', 'converted', 'rejected')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  -- Server-computed sha256 of canonical URL + canonical client hints + note.
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  client_note text not null default '' check (length(client_note) <= 2000),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotency survives requester anonymisation through requester_ref.
  unique (requester_ref, idempotency_key)
);

-- One open request per requester and external source.
create unique index novel_requests_active_source
  on public.novel_requests (requester_ref, external_source_id)
  where status in ('submitted', 'review', 'needs_rights', 'draft');
create index novel_requests_queue
  on public.novel_requests (status, created_at)
  where status in ('submitted', 'review', 'needs_rights');
create index novel_requests_requester
  on public.novel_requests (requester_ref, created_at desc);
create index novel_requests_work on public.novel_requests (work_id);

-- User-provided hints. Untrusted, never used as match input or identity;
-- shown to moderators as "user hint" only.
create table public.request_client_hints (
  request_id uuid primary key references public.novel_requests(id) on delete restrict,
  source text not null default 'requester' check (source = 'requester'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

-- Adapter-provided metadata with provenance. In this phase no adapter is
-- enabled, so this table stays empty; matching must read only from here.
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
-- 6. Draft with unverified rights. Rights are authoritative here only before
--    conversion; afterwards novel_sources is authoritative (mirror trigger).
-- ----------------------------------------------------------------------------
create table public.request_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.novel_requests(id) on delete restrict,
  work_id uuid references public.request_works(id) on delete restrict,
  source_url text not null
    check (source_url ~ '^https://' and length(source_url) <= 2048),
  permitted_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permitted_metadata) = 'object'),
  rights_status text not null default 'pending'
    check (rights_status in ('pending', 'verified', 'expired', 'revoked')),
  rights_evidence_id uuid,
  converted_source_id uuid references public.novel_sources(id) on delete restrict,
  publication_blocked boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_ref text check (created_by_ref is null or created_by_ref ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index request_drafts_one_source
  on public.request_drafts (converted_source_id)
  where converted_source_id is not null;

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
-- 8. Optional server-side rate-limit counters (preliminary; numbers pending).
-- ----------------------------------------------------------------------------
create table public.request_rate_counters (
  bucket_key text not null check (length(bucket_key) between 1 and 200),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (bucket_key, window_start)
);

-- ----------------------------------------------------------------------------
-- 9. RLS and grants. Tables are not directly readable by clients: projections
--    below are the only client-facing read paths. Views run with the owner's
--    rights, so their WHERE clauses are the security boundary and must be
--    reviewed and tested separately.
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
  from anon, authenticated, public;
revoke all on private.request_rights_evidence from anon, authenticated, public;

-- Background jobs (publication and future retention) keep service_role access.
grant all on public.request_works, public.request_work_titles,
  public.request_work_authors, public.request_external_sources,
  public.novel_requests, public.request_client_hints,
  public.request_adapter_metadata, public.request_match_evidence,
  public.request_moderation_decisions, public.request_drafts,
  public.request_rate_counters to service_role;
grant all on private.request_rights_evidence to service_role;

-- Owner projection: only the requester's own request, no private columns.
create view public.request_owner_view
with (security_invoker = false) as
select
  r.id,
  r.status,
  r.created_at,
  r.updated_at,
  e.host as source_host,
  d.rights_status,
  d.publication_blocked,
  (d.converted_source_id is not null) as converted,
  coalesce((
    select jsonb_agg(jsonb_build_object('kind', me.kind, 'reasons', me.reasons))
    from public.request_match_evidence me
    where me.request_id = r.id
  ), '[]'::jsonb) as matches
from public.novel_requests r
join public.request_external_sources e on e.id = r.external_source_id
left join public.request_drafts d on d.request_id = r.id
where r.requester_id = auth.uid();
revoke all on public.request_owner_view from anon, public;
grant select on public.request_owner_view to authenticated;

-- Staff projection: only for a row in novel_staff. Role comes from the table,
-- never from JWT metadata.
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
  d.rights_status,
  d.publication_blocked,
  d.converted_source_id
from public.novel_requests r
join public.request_external_sources e on e.id = r.external_source_id
left join public.request_drafts d on d.request_id = r.id
where exists (
  select 1 from public.novel_staff s
  where s.user_id = auth.uid() and s.role in ('editor', 'admin')
);
revoke all on public.request_staff_view from anon, public;
grant select on public.request_staff_view to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Rights mirror and draft guard.
--   * Before conversion: request_drafts.rights_status is authoritative and is
--     written only by the (not yet implemented) admin rights function.
--   * After conversion: novel_sources.rights_status is authoritative; this
--     trigger projects it into the draft and prevents independent edits.
-- ----------------------------------------------------------------------------
create or replace function private.request_draft_rights_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.request_drafts
     set rights_status = new.rights_status,
         publication_blocked = (new.rights_status <> 'verified'),
         updated_at = now()
   where converted_source_id = new.id;
  return new;
end;
$$;

create trigger request_drafts_rights_mirror
after update of rights_status on public.novel_sources
for each row execute function private.request_draft_rights_mirror();

create or replace function private.request_draft_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The conversion function sets converted_source_id once; nothing may move it.
  if tg_op = 'UPDATE' and old.converted_source_id is not null
     and new.converted_source_id is distinct from old.converted_source_id then
    raise exception 'Converted draft link is immutable';
  end if;

  -- After conversion the rights mirror is written only by the mirror trigger
  -- (nested trigger depth > 1). Direct changes are rejected.
  if tg_op = 'UPDATE' and old.converted_source_id is not null
     and new.rights_status is distinct from old.rights_status
     and pg_trigger_depth() = 1 then
    raise exception 'Rights are authoritative in novel_sources after conversion';
  end if;

  return new;
end;
$$;

create trigger request_drafts_guard
before update on public.request_drafts
for each row execute function private.request_draft_guard();

-- ----------------------------------------------------------------------------
-- 11. Drift report. Must return zero rows in a healthy system.
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
  select 'rights_mirror_drift'::text, r.id, r.work_id, d.converted_source_id
    from public.request_drafts d
    join public.novel_sources s on s.id = d.converted_source_id
    join public.novel_requests r on r.id = d.request_id
   where d.rights_status <> s.rights_status
  union all
  select 'external_source_work_mismatch'::text, r.id, r.work_id, null::uuid
    from public.novel_requests r
    join public.request_external_sources e on e.id = r.external_source_id
   where r.work_id is not null and e.work_id is distinct from r.work_id
  union all
  select 'work_with_multiple_sources'::text, null::uuid, w.id, null::uuid
    from public.request_works w
   group by w.id
  having count(w.novel_source_id) > 1;
$$;
revoke all on function public.request_consistency_report() from anon, authenticated, public;
grant execute on function public.request_consistency_report() to service_role;

-- ----------------------------------------------------------------------------
-- 12. Server functions: NOT IMPLEMENTED in this candidate.
--
-- These write paths are deliberately absent. They must be implemented and
-- reviewed server-side (SECURITY DEFINER with `set search_path = ''`), with
-- explicit parameter allow-lists, rate limits, audit writes and transaction
-- boundaries. Signatures are recorded here so the SQL candidate and the server
-- contract stay aligned:
--
-- private.request_create(p_url text, p_note text, p_idempotency_key text,
--                        p_client_hints jsonb) returns jsonb
--   - auth.uid() required; derive requester_ref; enforce rate limits;
--   - recognize the URL only through an enabled adapter (none in this phase);
--   - upsert request_external_sources on (provider, external_id);
--   - compute request_fingerprint server-side; on same key + same fingerprint
--     return the existing request; different fingerprint -> conflict;
--   - insert novel_requests (status submitted, version 1), hints and match
--     evidence; never accept status/source/work/rights from the caller.
--
-- private.request_decide(p_request uuid, p_to text, p_reason text,
--                         p_expected_version integer) returns jsonb
--   - lock request FOR UPDATE; actor from novel_staff (editor/admin);
--   - validate the structural transition (same table as the docs/prototype);
--   - reject when version <> p_expected_version (409 semantics);
--   - insert append-only decision; update status/version; create the draft on
--     review -> draft with rights_status='pending', publication_blocked=true.
--
-- private.request_set_rights(p_request uuid, p_status text, p_evidence text,
--                             p_valid_until date) returns jsonb
--   - admin only; allowed only before conversion;
--   - write private.request_rights_evidence, then draft rights_status; record
--     an audit decision; after conversion raise an exception.
--
-- private.request_convert(p_request uuid, p_source uuid,
--                          p_expected_version integer) returns jsonb
--   - admin only, in one transaction: lock request; require status='draft';
--     require work and external source linked to it; require novel_sources row;
--     require no other work/request uses that source; set request.status,
--     work.state='converted', work.novel_source_id, draft.converted_source_id,
--     copy source rights into the mirror, publication_blocked accordingly,
--     bump version, insert decision.
--
-- Unresolved issues (owner decisions, see docs §12):
--   * retention periods and whether hard deletion is ever allowed;
--   * view ownership: definer views above must be reviewed for RLS bypass;
--     alternatively use security_invoker views plus column-level grants;
--   * rate-limit numbers, account requirement, adapter allowlist;
--   * whether conversion is allowed while rights are still pending (proposal: yes).
-- ============================================================================
