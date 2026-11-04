-- Anons Studio: manual subscription orders, no PSP/card charging.
-- Public user ID 1 is intentionally unassigned and reserved for the verified owner.
-- Other users receive consecutive IDs starting at 2, bound to their Supabase Auth UUID.
-- Do not associate #1 with the first signup or with unverified client-provided claims.

create sequence public.anons_studio_customer_no_seq
  as bigint start with 2 increment by 1 minvalue 2 no cycle;
revoke all on sequence public.anons_studio_customer_no_seq from public, anon, authenticated;

create table public.anons_studio_customer_ids (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_no bigint not null unique check (customer_no >= 1),
  created_at timestamptz not null default now()
);
comment on table public.anons_studio_customer_ids is
  'Public-facing permanent customer numbers; #1 reserved for owner. UUID remains the authorization identity.';
alter table public.anons_studio_customer_ids enable row level security;
revoke all on public.anons_studio_customer_ids from public,anon,authenticated;
grant select on public.anons_studio_customer_ids to authenticated;
create policy "customer_read_own" on public.anons_studio_customer_ids
 for select to authenticated using ((select auth.uid()) = user_id);

create table public.anons_studio_manual_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.anons_studio_manual_admins is
  'Privileged manual payment reviewers. Add a verified owner using trusted database administration only.';
alter table public.anons_studio_manual_admins enable row level security;
revoke all on public.anons_studio_manual_admins from public,anon,authenticated;
-- No policies: only trusted SECURITY DEFINER functions can read the reviewer allowlist.

create sequence public.anons_studio_manual_order_no_seq
  as bigint start with 100001 increment by 1 minvalue 100001 no cycle;
revoke all on sequence public.anons_studio_manual_order_no_seq from public,anon,authenticated;
create table public.anons_studio_manual_orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint not null unique default nextval('public.anons_studio_manual_order_no_seq'::regclass),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  plan text not null default 'basic' check (plan = 'basic'),
  amount_kopecks integer not null default 29900 check (amount_kopecks = 29900),
  currency text not null default 'RUB' check (currency = 'RUB'),
  status text not null default 'awaiting_instructions'
    check(status in ('awaiting_instructions','payment_reported','approved','rejected','canceled')),
  transfer_note text not null default '' check (char_length(transfer_note) <= 280),
  created_at timestamptz not null default now(),
  reported_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  constraint manual_order_report_guard check (
    status not in ('payment_reported','approved') or reported_at is not null
  )
);
comment on table public.anons_studio_manual_orders is
  'Prepaid Basic orders; customers cannot mark orders paid or grant themselves a subscription.';
create index anons_manual_orders_owner_time_idx on public.anons_studio_manual_orders(user_id,created_at desc);
create index anons_manual_orders_pending_idx on public.anons_studio_manual_orders(status,created_at desc);
create unique index anons_manual_one_open_order_per_customer
 on public.anons_studio_manual_orders(user_id)
 where status in ('awaiting_instructions','payment_reported');
alter table public.anons_studio_manual_orders enable row level security;
revoke all on public.anons_studio_manual_orders from public,anon,authenticated;
grant select on public.anons_studio_manual_orders to authenticated;
create policy "manual_order_read_own" on public.anons_studio_manual_orders
 for select to authenticated using ((select auth.uid())=user_id);

-- Only owner-confirmed email accounts are assigned customer numbers.
create or replace function public.anons_studio_customer_number()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  number_value bigint;
begin
  if uid is null or not exists (
    select 1 from auth.users where id=uid and email_confirmed_at is not null
  ) then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='P0001';end if;
  select customer_no into number_value from public.anons_studio_customer_ids where user_id=uid;
  if number_value is not null then return number_value;end if;
  insert into public.anons_studio_customer_ids(user_id,customer_no)
    values(uid,nextval('public.anons_studio_customer_no_seq'::regclass))
    on conflict (user_id) do nothing;
  select customer_no into number_value from public.anons_studio_customer_ids where user_id=uid;
  return number_value;
end
$$;

create or replace function public.anons_studio_manual_create_order()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  last_order bigint;
  recent_orders int;
begin
  perform public.anons_studio_customer_number();
  select order_no into last_order from public.anons_studio_manual_orders
    where user_id=uid and status in ('awaiting_instructions','payment_reported')
    order by created_at desc limit 1;
  if last_order is not null then return last_order;end if;
  select count(*) into recent_orders from public.anons_studio_manual_orders
    where user_id=uid and created_at>now()-interval '24 hours';
  if recent_orders>=5 then raise exception 'ORDER_RATE_LIMITED' using errcode='P0001';end if;
  insert into public.anons_studio_manual_orders(user_id,contact_email)
    select id,email from auth.users where id=uid and email_confirmed_at is not null
    returning order_no into last_order;
  if last_order is null then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='P0001';end if;
  return last_order;
end
$$;

create or replace function public.anons_studio_manual_report_transfer(
 p_order_no bigint, p_note text default '')
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
 uid uuid:=auth.uid();
 notes text:=btrim(coalesce(p_note,''));
begin
 if uid is null then raise exception 'LOGIN_REQUIRED' using errcode='P0001';end if;
 if char_length(notes)>280 then raise exception 'NOTE_TOO_LONG' using errcode='P0001';end if;
 update public.anons_studio_manual_orders
 set status='payment_reported',transfer_note=notes,reported_at=now()
 where order_no=p_order_no and user_id=uid and status='awaiting_instructions';
 if not found then raise exception 'ORDER_NOT_ELIGIBLE' using errcode='P0001';end if;
 return true;
end
$$;

create or replace function public.anons_studio_manual_cancel_order(p_order_no bigint)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='P0001';end if;
 update public.anons_studio_manual_orders set status='canceled'
 where order_no=p_order_no and user_id=auth.uid() and status='awaiting_instructions';
 if not found then raise exception 'ORDER_NOT_ELIGIBLE' using errcode='P0001';end if;
 return true;
end
$$;

create or replace function public.anons_studio_manual_is_admin()
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 return auth.uid() is not null and exists(
   select 1 from public.anons_studio_manual_admins where user_id=auth.uid()
 );
end
$$;

create or replace function public.anons_studio_manual_admin_orders()
returns table(
 order_no bigint, customer_no bigint, contact_email text, plan text,
 amount_kopecks integer, status text, transfer_note text,
 created_at timestamptz, reported_at timestamptz, reviewed_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
 if not public.anons_studio_manual_is_admin() then
   raise exception 'ADMIN_REQUIRED' using errcode='42501';
 end if;
 return query select o.order_no,c.customer_no,o.contact_email,o.plan,
    o.amount_kopecks,o.status,o.transfer_note,o.created_at,o.reported_at,o.reviewed_at
   from public.anons_studio_manual_orders o
   join public.anons_studio_customer_ids c on c.user_id=o.user_id
   order by o.created_at desc limit 100;
end
$$;

create or replace function public.anons_studio_manual_review(
 p_order_no bigint,p_approve boolean
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
 rec public.anons_studio_manual_orders%rowtype;
 membership_plan text;
begin
 if not public.anons_studio_manual_is_admin() then
   raise exception 'ADMIN_REQUIRED' using errcode='42501';
 end if;
 if p_approve is null then raise exception 'INVALID_DECISION' using errcode='P0001';end if;
 select * into rec from public.anons_studio_manual_orders where order_no=p_order_no for update;
 if not found or (p_approve and rec.status<>'payment_reported')
   or (not p_approve and rec.status not in ('awaiting_instructions','payment_reported')) then
   raise exception 'ORDER_NOT_REVIEWABLE' using errcode='P0001';
 end if;
 if p_approve then
   select plan into membership_plan from public.anons_studio_memberships
    where user_id=rec.user_id for update;
   if membership_plan is not null and membership_plan<>'basic' then
     raise exception 'OTHER_PLAN_ACTIVE' using errcode='P0001';
   end if;
   insert into public.anons_studio_memberships
       (user_id,plan,status,current_period_end,updated_at)
     values (rec.user_id,'basic','active',now()+interval '30 days',now())
     on conflict(user_id) do update
       set plan='basic',status='active',
         current_period_end=greatest(coalesce(public.anons_studio_memberships.current_period_end,now()),now())+interval '30 days',
         updated_at=now();
 end if;
 update public.anons_studio_manual_orders set
   status=case when p_approve then 'approved' else 'rejected' end,
   reviewed_at=now(),reviewed_by=auth.uid()
 where id=rec.id;
 return case when p_approve then 'approved' else 'rejected' end;
end
$$;

-- All RPCs enforce auth.uid() and allowlisted reviewer checks server-side.
revoke all on function public.anons_studio_customer_number() from public,anon,authenticated;
revoke all on function public.anons_studio_manual_create_order() from public,anon,authenticated;
revoke all on function public.anons_studio_manual_report_transfer(bigint,text) from public,anon,authenticated;
revoke all on function public.anons_studio_manual_cancel_order(bigint) from public,anon,authenticated;
revoke all on function public.anons_studio_manual_is_admin() from public,anon,authenticated;
revoke all on function public.anons_studio_manual_admin_orders() from public,anon,authenticated;
revoke all on function public.anons_studio_manual_review(bigint,boolean) from public,anon,authenticated;
grant execute on function public.anons_studio_customer_number() to authenticated;
grant execute on function public.anons_studio_manual_create_order() to authenticated;
grant execute on function public.anons_studio_manual_report_transfer(bigint,text) to authenticated;
grant execute on function public.anons_studio_manual_cancel_order(bigint) to authenticated;
grant execute on function public.anons_studio_manual_is_admin() to authenticated;
grant execute on function public.anons_studio_manual_admin_orders() to authenticated;
grant execute on function public.anons_studio_manual_review(bigint,boolean) to authenticated;
