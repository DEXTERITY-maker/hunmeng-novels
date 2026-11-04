-- Stage 8: client choice of manual Basic/Pro/Studio, immutable server prices.
-- Existing orders and entitlements remain unchanged.
alter table public.anons_studio_manual_orders
  drop constraint if exists anons_studio_manual_orders_plan_check,
  drop constraint if exists anons_studio_manual_orders_amount_kopecks_check;
alter table public.anons_studio_manual_orders
  add constraint anons_manual_order_plan_valid
    check (plan in ('basic','pro','studio')),
  add constraint anons_manual_order_price_locked
    check ((plan='basic' and amount_kopecks=29900)
       or (plan='pro' and amount_kopecks=49900)
       or (plan='studio' and amount_kopecks=99900));

create or replace function public.anons_studio_manual_create_order(p_plan text)
returns bigint language plpgsql security definer set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  new_no bigint;
  active_order record;
  recent_orders integer;
  price integer;
begin
  if p_plan not in ('basic','pro','studio') or p_plan is null then
    raise exception 'INVALID_PLAN' using errcode='P0001';
  end if;
  price:=case p_plan when 'basic' then 29900 when 'pro' then 49900 else 99900 end;
  perform public.anons_studio_customer_number();
  select order_no,plan into active_order
  from public.anons_studio_manual_orders
  where user_id=uid and status in ('awaiting_instructions','payment_reported')
  order by created_at desc limit 1;
  if active_order.order_no is not null then
    if active_order.plan<>p_plan then
      raise exception 'ORDER_ALREADY_OPEN_OTHER_PLAN' using errcode='P0001';
    end if;
    return active_order.order_no;
  end if;
  if exists(select 1 from public.anons_studio_memberships
    where user_id=uid and status in ('active','trialing') and current_period_end>now() and plan<>p_plan) then
    raise exception 'OTHER_PLAN_ACTIVE' using errcode='P0001';
  end if;
  select count(*) into recent_orders from public.anons_studio_manual_orders
  where user_id=uid and created_at>now()-interval '24 hours';
  if recent_orders>=5 then raise exception 'ORDER_RATE_LIMITED' using errcode='P0001';end if;
  insert into public.anons_studio_manual_orders(user_id,contact_email,plan,amount_kopecks)
    select id,email,p_plan,price from auth.users where id=uid and email_confirmed_at is not null
  returning order_no into new_no;
  if new_no is null then raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='P0001';end if;
  return new_no;
end
$$;

-- Legacy client callers still receive Basic if the old form is used.
create or replace function public.anons_studio_manual_create_order()
returns bigint language plpgsql security definer set search_path=''
as $$
begin
  return public.anons_studio_manual_create_order('basic');
end
$$;

-- Human-only approval; switches between *active* different plans are blocked.
-- Upgrades/downgrades become available after the existing prepaid term expires.
create or replace function public.anons_studio_manual_review(
  p_order_no bigint,p_approve boolean
)
returns text language plpgsql security definer set search_path=''
as $$
declare
  rec public.anons_studio_manual_orders%rowtype;
  old_member public.anons_studio_memberships%rowtype;
  next_end timestamptz;
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
    if (rec.plan='basic' and rec.amount_kopecks<>29900)
       or (rec.plan='pro' and rec.amount_kopecks<>49900)
       or (rec.plan='studio' and rec.amount_kopecks<>99900) then
      raise exception 'ORDER_PRICE_MISMATCH' using errcode='P0001';
    end if;
    select * into old_member from public.anons_studio_memberships
      where user_id=rec.user_id for update;
    if old_member.user_id is not null
       and old_member.plan<>rec.plan
       and old_member.status in ('active','trialing')
       and old_member.current_period_end>now() then
      raise exception 'OTHER_PLAN_ACTIVE' using errcode='P0001';
    end if;
    next_end:=case when old_member.user_id is not null
      and old_member.plan=rec.plan
      and old_member.status in ('active','trialing')
      and old_member.current_period_end>now()
      then old_member.current_period_end+interval '30 days'
      else now()+interval '30 days' end;
    insert into public.anons_studio_memberships
      (user_id,plan,status,current_period_end,updated_at)
    values (rec.user_id,rec.plan,'active',next_end,now())
    on conflict(user_id) do update
      set plan=excluded.plan,status='active',current_period_end=excluded.current_period_end,updated_at=now();
  end if;
  update public.anons_studio_manual_orders set
    status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid()
  where id=rec.id;
  return case when p_approve then 'approved' else 'rejected' end;
end
$$;
revoke all on function public.anons_studio_manual_create_order(text)
 from public,anon,authenticated;
grant execute on function public.anons_studio_manual_create_order(text) to authenticated;
