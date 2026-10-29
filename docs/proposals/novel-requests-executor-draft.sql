-- EXPERIMENTAL: disposable test database only. NOT a migration.
-- Run after both request schema and store drafts. This role is NOLOGIN and is
-- not assigned to anyone. Production login provisioning, role ownership and
-- Supabase-specific privileges require separate design and integration tests.
-- The server is a trust boundary: it must independently validate each user
-- with Supabase Auth, derive requester_ref securely, and keep credentials out
-- of clients. This role alone cannot validate a presented JWT.

create role hunmeng_request_executor
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create function private.request_store_read(p_request_id uuid, p_actor_id uuid, p_requester_ref text)
returns table (
  id uuid, requester_ref text, request_fingerprint text, client_note text,
  status text, created_at timestamptz, provider text, external_id text,
  canonical_url text, payload jsonb
)
language sql security definer set search_path = '' stable
as $$
  select r.id, r.requester_ref, r.request_fingerprint, r.client_note,
         r.status, r.created_at, e.provider, e.external_id, e.canonical_url, h.payload
  from public.novel_requests r
  join public.request_external_sources e on e.id = r.external_source_id
  join public.request_client_hints h on h.request_id = r.id
  where r.id = p_request_id and r.requester_id = p_actor_id
    and r.requester_ref = p_requester_ref
$$;

revoke all on function private.request_store_read(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant usage on schema private to hunmeng_request_executor;
grant execute on function private.request_store_create(uuid, text, text, text, text, text, text, text, text, jsonb)
  to hunmeng_request_executor;
grant execute on function private.request_store_read(uuid, uuid, text)
  to hunmeng_request_executor;
