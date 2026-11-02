-- Apply separately to the existing Supabase database before enabling the webhook.
-- All state is private, short lived, and accessible only to the dedicated guard role.
begin;
-- Fail closed if this role already exists: never inherit unknown pre-existing grants.
create role telegram_bot_guard nologin noinherit nobypassrls;
grant telegram_bot_guard to authenticator;
grant usage on schema public to telegram_bot_guard;
create table if not exists public.telegram_bot_updates (
  update_id bigint primary key,
  seen_at timestamptz not null default clock_timestamp()
);
create index if not exists telegram_bot_updates_seen_idx on public.telegram_bot_updates (seen_at);
create table if not exists public.telegram_bot_limits (
  actor_hash text primary key check (actor_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null
);
create index if not exists telegram_bot_limits_window_idx on public.telegram_bot_limits (window_start);
alter table public.telegram_bot_updates enable row level security;
alter table public.telegram_bot_limits enable row level security;
revoke all on public.telegram_bot_updates, public.telegram_bot_limits from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.telegram_bot_updates, public.telegram_bot_limits to telegram_bot_guard;
create policy telegram_bot_updates_guard on public.telegram_bot_updates
  for all to telegram_bot_guard using (true) with check (true);
create policy telegram_bot_limits_guard on public.telegram_bot_limits
  for all to telegram_bot_guard using (true) with check (true);

-- One transaction serializes duplicate updates and per-actor rate counters.
create or replace function public.telegram_bot_admit(p_update_id bigint, p_actor_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare inserted bigint; n integer; t timestamptz := clock_timestamp();
begin
  if p_update_id is null or p_update_id < 0 or p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid request'; end if;
  if mod(p_update_id, 100) = 0 then
    delete from public.telegram_bot_updates where seen_at < t - interval '3 days';
    delete from public.telegram_bot_limits where window_start < t - interval '3 days';
  end if;
  insert into public.telegram_bot_updates(update_id, seen_at) values (p_update_id, t)
    on conflict do nothing returning update_id into inserted;
  if inserted is null then return 'duplicate'; end if;
  insert into public.telegram_bot_limits(actor_hash, window_start, hits) values (p_actor_hash, t, 1)
  on conflict (actor_hash) do update set
    window_start = case when public.telegram_bot_limits.window_start <= t - interval '1 minute' then t else public.telegram_bot_limits.window_start end,
    hits = case when public.telegram_bot_limits.window_start <= t - interval '1 minute' then 1 else public.telegram_bot_limits.hits + 1 end
  returning hits into n;
  if n > 12 then return 'limited'; end if;
  return 'accepted';
end
$$;
revoke all on function public.telegram_bot_admit(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.telegram_bot_admit(bigint, text) to telegram_bot_guard;
commit;
