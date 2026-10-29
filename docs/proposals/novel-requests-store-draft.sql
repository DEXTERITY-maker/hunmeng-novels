-- EXPERIMENTAL: isolated database tests only; NOT a migration or public API.
-- Depends on novel-requests-schema-draft.sql. All parameters are supplied by a
-- trusted, server-only caller after identity and source verification. The
-- function is deliberately not granted to authenticated, anon or service_role.
-- It does not implement a real source adapter, IP limit,
-- review queue, notifications, rights verification or publication.

create table private.request_idempotency_keys (
  requester_ref text not null check (requester_ref ~ '^[0-9a-f]{64}$'),
  key text not null check (length(key) between 8 and 128),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  request_id uuid not null references public.novel_requests(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (requester_ref, key)
);
alter table private.request_idempotency_keys enable row level security;
revoke all on private.request_idempotency_keys from public, anon, authenticated, service_role;

create function private.request_store_create(
  p_actor_id uuid,
  p_requester_ref text,
  p_provider text,
  p_external_id text,
  p_canonical_url text,
  p_host text,
  p_key text,
  p_fingerprint text,
  p_note text,
  p_hints jsonb,
  p_metadata jsonb,
  p_adapter_version text,
  p_policy_id text,
  p_matches jsonb,
  p_algorithm_version text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  saved_key private.request_idempotency_keys%rowtype;
  src public.request_external_sources%rowtype;
  req public.novel_requests%rowtype;
  hour_count integer;
  day_count integer;
  match_item jsonb;
begin
  -- Caller must authenticate actor, derive ref using a reviewed keyed scheme,
  -- normalize and authorize the source, and compute the fingerprint. Nothing
  -- here is exposed to untrusted clients or proves those upstream guarantees.
  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id)
     or p_requester_ref is null or p_requester_ref !~ '^[0-9a-f]{64}$'
     or p_provider is null or p_provider !~ '^[a-z0-9][a-z0-9-]{1,39}$'
     or p_external_id is null or length(p_external_id) not between 1 and 128
     or p_canonical_url is null or length(p_canonical_url) > 2048 or p_canonical_url !~ '^https://'
     or p_host is null or length(p_host) not between 1 and 253
     or p_key is null or length(p_key) not between 8 and 128
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
     or p_note is null or length(p_note) > 2000
     or p_hints is null or jsonb_typeof(p_hints) <> 'object' or octet_length(p_hints::text) > 20000
     or p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 20000
     or p_adapter_version is null or length(btrim(p_adapter_version)) not between 1 and 64
     or p_policy_id is null or length(btrim(p_policy_id)) not between 1 and 128
     or p_algorithm_version is null or length(btrim(p_algorithm_version)) not between 1 and 64
     or p_matches is null or jsonb_typeof(p_matches) <> 'array'
  then raise exception 'Invalid request input' using errcode = '22023'; end if;
  if jsonb_array_length(p_matches) > 50 or exists (
    select 1 from jsonb_object_keys(p_metadata) k
    where k not in ('originalTitle', 'alternativeTitles', 'authors', 'chapterTitles')
  ) then raise exception 'Invalid adapter evidence' using errcode = '22023'; end if;

  -- This serializes quota, idempotency and active-source checks for one user.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('request-user:' || p_requester_ref, 0));
  select * into saved_key from private.request_idempotency_keys
    where requester_ref = p_requester_ref and key = p_key;
  if found then
    if saved_key.fingerprint <> p_fingerprint then return jsonb_build_object('kind', 'conflict'); end if;
    select * into req from public.novel_requests where id = saved_key.request_id;
    if not found or req.requester_id is distinct from p_actor_id then
      raise exception 'Request identity mismatch' using errcode = '28000';
    end if;
    return jsonb_build_object('kind', 'replay', 'request_id', req.id, 'status', req.status);
  end if;

  select * into src from public.request_external_sources
    where provider = p_provider and external_id = p_external_id;
  if found then
    if src.canonical_url <> p_canonical_url or src.host <> p_host then
      raise exception 'Source identity conflict' using errcode = '22023';
    end if;
    select * into req from public.novel_requests
      where requester_ref = p_requester_ref and external_source_id = src.id
        and status in ('submitted', 'review', 'needs_rights', 'draft') limit 1;
    if found then
      if req.requester_id is distinct from p_actor_id then
        raise exception 'Request identity mismatch' using errcode = '28000';
      end if;
      insert into private.request_idempotency_keys(requester_ref, key, fingerprint, request_id)
        values (p_requester_ref, p_key, p_fingerprint, req.id);
      return jsonb_build_object('kind', 'active-request', 'request_id', req.id, 'status', req.status);
    end if;
  end if;

  -- Preliminary per-user limits, for tests only; not a replacement for an
  -- HTTP/IP abuse limiter. Replays and active requests do not consume quota.
  select count(*) filter (where created_at >= now() - interval '1 hour'), count(*)
    into hour_count, day_count from public.novel_requests
    where requester_ref = p_requester_ref and created_at >= now() - interval '1 day';
  if hour_count >= 5 or day_count >= 20 then return jsonb_build_object('kind', 'quota-exceeded'); end if;

  insert into public.request_external_sources(provider, external_id, canonical_url, host)
    values (p_provider, p_external_id, p_canonical_url, p_host)
    on conflict (provider, external_id) do nothing;
  select * into strict src from public.request_external_sources
    where provider = p_provider and external_id = p_external_id;
  if src.canonical_url <> p_canonical_url or src.host <> p_host then
    raise exception 'Source identity conflict' using errcode = '22023';
  end if;
  insert into public.novel_requests(requester_id, requester_ref, submitted_url, external_source_id,
      work_id, idempotency_key, request_fingerprint, client_note)
    values (p_actor_id, p_requester_ref, p_canonical_url, src.id, src.work_id, p_key, p_fingerprint, p_note)
    returning * into req;
  insert into public.request_client_hints(request_id, payload) values (req.id, p_hints);
  insert into public.request_adapter_metadata(request_id, provider, adapter_version, policy_id, algorithm_version, metadata, provenance)
    values (req.id, p_provider, p_adapter_version, p_policy_id, p_algorithm_version, p_metadata, 'trusted-adapter');
  for match_item in select value from jsonb_array_elements(p_matches) loop
    if jsonb_typeof(match_item) <> 'object' or jsonb_typeof(match_item->'workId') <> 'string'
       or (match_item->>'workId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or match_item->>'kind' not in ('exact', 'probable') or jsonb_typeof(match_item->'reasons') <> 'array'
    then raise exception 'Invalid match evidence' using errcode = '22023'; end if;
    if jsonb_array_length(match_item->'reasons') not between 1 and 8 or exists (
      select 1 from jsonb_array_elements(match_item->'reasons') reason
      where jsonb_typeof(reason) <> 'string' or length(reason #>> '{}') not between 1 and 200
    ) then raise exception 'Invalid match reasons' using errcode = '22023'; end if;
    insert into public.request_match_evidence(request_id, kind, matched_work_id, reasons, algorithm_version)
      values (req.id, match_item->>'kind', (match_item->>'workId')::uuid, match_item->'reasons', p_algorithm_version);
  end loop;
  insert into private.request_idempotency_keys(requester_ref, key, fingerprint, request_id)
    values (p_requester_ref, p_key, p_fingerprint, req.id);
  return jsonb_build_object('kind', 'new', 'request_id', req.id, 'status', req.status);
end;
$$;
revoke all on function private.request_store_create(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
