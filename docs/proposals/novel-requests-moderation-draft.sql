-- EXPERIMENTAL, disposable test database only. NOT a migration.
-- Requires the request schema draft and the existing novel_staff table.
-- Only a trusted server may call these functions, after validating a live
-- Supabase Auth session and deriving the actor reference with a server key.
-- An executor credential can impersonate staff: this is NOT a JWT verifier.
-- No moderation endpoint or production role/login is created by this draft.

create role hunmeng_moderation_executor
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

-- Supports stable cursor pagination of the active moderation queue.
create index novel_requests_moderation_cursor
  on public.novel_requests (created_at, id)
  where status in ('submitted', 'review', 'needs_rights', 'draft');

create function private.request_moderation_queue(
  p_actor uuid, p_after_time timestamptz, p_after_id uuid, p_limit integer
) returns table (
  id uuid, status text, version integer, created_at text,
  submitted_url text, client_note text, hints jsonb, metadata jsonb, matches jsonb
)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_actor is null or not exists (
    select 1 from public.novel_staff s where s.user_id = p_actor and s.role in ('editor', 'admin')
  ) then raise exception 'Staff authorization required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 or
     (p_after_time is null) <> (p_after_id is null) then
    raise exception 'Invalid queue cursor or limit' using errcode = '22023';
  end if;
  return query
    select r.id, r.status, r.version, r.created_at::text, r.submitted_url, r.client_note,
      coalesce(h.payload, '{}'::jsonb), coalesce(a.metadata, '{}'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('workId', m.matched_work_id,
        'kind', m.kind, 'reasons', m.reasons) order by m.id)
        from public.request_match_evidence m where m.request_id = r.id), '[]'::jsonb)
    from public.novel_requests r
    left join public.request_client_hints h on h.request_id = r.id
    left join lateral (select x.metadata from public.request_adapter_metadata x
      where x.request_id = r.id order by x.obtained_at desc, x.id desc limit 1) a on true
    where r.status in ('submitted', 'review', 'needs_rights', 'draft')
      and (p_after_time is null or (r.created_at, r.id) > (p_after_time, p_after_id))
    order by r.created_at, r.id limit p_limit;
end
$$;

create function private.request_moderate(
  p_actor uuid, p_actor_ref text, p_request uuid, p_expected_version integer,
  p_to text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_status text;
  v_version integer;
begin
  if p_actor is null or p_actor_ref is null or p_actor_ref !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid actor' using errcode = '22023';
  end if;
  -- Block removal or changes to the staff role until this decision commits.
  select s.role into v_role from public.novel_staff s
    where s.user_id = p_actor and s.role in ('editor', 'admin') for share;
  if v_role is null then raise exception 'Staff authorization required' using errcode = '42501'; end if;
  if p_request is null or p_expected_version is null or p_expected_version < 1 or
     p_to is null or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'Invalid moderation input' using errcode = '22023';
  end if;
  select r.status, r.version into v_status, v_version from public.novel_requests r
    where r.id = p_request for update;
  if not found then return jsonb_build_object('kind', 'not-found'); end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('kind', 'conflict', 'version', v_version);
  end if;
  -- Only status-only transitions are supported. Draft creation and conversion
  -- require their own transactional implementations and remain disabled.
  if not (
    (v_status = 'submitted' and p_to = 'review') or
    (v_status = 'review' and p_to = 'needs_rights') or
    (v_status = 'needs_rights' and p_to = 'review') or
    (v_role = 'admin' and p_to = 'rejected' and v_status in ('submitted', 'review', 'needs_rights', 'draft')) or
    (v_role = 'admin' and p_to = 'review' and v_status in ('draft', 'rejected'))
  ) then raise exception 'Transition not permitted' using errcode = '42501'; end if;
  if v_version = 2147483647 then raise exception 'Version exhausted' using errcode = '22003'; end if;
  update public.novel_requests set status = p_to, version = v_version + 1, updated_at = now()
    where id = p_request;
  insert into public.request_moderation_decisions
    (request_id, actor_id, actor_ref, actor_role, from_status, to_status, reason, request_version)
    values (p_request, p_actor, p_actor_ref, v_role, v_status, p_to, btrim(p_reason), v_version + 1);
  return jsonb_build_object('kind', 'updated', 'status', p_to, 'version', v_version + 1);
end
$$;

revoke all on function private.request_moderation_queue(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.request_moderate(uuid, text, uuid, integer, text, text)
  from public, anon, authenticated, service_role;
grant usage on schema private to hunmeng_moderation_executor;
grant execute on function private.request_moderation_queue(uuid, timestamptz, uuid, integer)
  to hunmeng_moderation_executor;
grant execute on function private.request_moderate(uuid, text, uuid, integer, text, text)
  to hunmeng_moderation_executor;
