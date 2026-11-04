-- Stage 12: two new upgrade tiers. Prices are fixed on the server, not by the caller.
-- All previous orders, invoice numbers, admins, RLS policies and entitlements are preserved.
alter table public.anons_studio_memberships
  drop constraint if exists anons_studio_memberships_plan_check;
alter table public.anons_studio_memberships
  add constraint anons_studio_memberships_plan_check
  check(plan in ('basic','pro','studio','agency','ultimate'));

alter table public.anons_studio_manual_orders
  drop constraint if exists anons_manual_order_plan_valid,
  drop constraint if exists anons_manual_order_price_locked;
alter table public.anons_studio_manual_orders
  add constraint anons_manual_order_plan_valid
    check(plan in ('basic','pro','studio','agency','ultimate')),
  add constraint anons_manual_order_price_locked
    check((plan='basic' and amount_kopecks=29900)
       or (plan='pro' and amount_kopecks=49900)
       or (plan='studio' and amount_kopecks=99900)
       or (plan='agency' and amount_kopecks=149900)
       or (plan='ultimate' and amount_kopecks=249900));

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
  if p_plan not in ('basic','pro','studio','agency','ultimate') or p_plan is null then
    raise exception 'INVALID_PLAN' using errcode='P0001';
  end if;
  price:=case p_plan when 'basic' then 29900 when 'pro' then 49900 when 'studio' then 99900 when 'agency' then 149900 else 249900 end;
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
       or (rec.plan='studio' and rec.amount_kopecks<>99900)
       or (rec.plan='agency' and rec.amount_kopecks<>149900)
       or (rec.plan='ultimate' and rec.amount_kopecks<>249900) then
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

create or replace function public.anons_studio_studio_apply_brand(
  p_targets jsonb,
  p_style jsonb
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  requested jsonb;
  target_id uuid;
  expected_version integer;
  target public.anons_studio_projects%rowtype;
  selected uuid[] := array[]::uuid[];
  chosen_theme text;
  chosen_color text;
  chosen_font text;
  revised_cards jsonb;
  revised_snapshot jsonb;
  changed integer := 0;
  membership_plan text;
  project_limit integer;
begin
  if uid is null or not exists (
    select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null
  ) then
    raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  select m.plan into membership_plan from public.anons_studio_memberships m
    where m.user_id=uid and m.plan in ('studio','agency','ultimate')
      and m.status in ('active','trialing') and m.current_period_end>now();
  if membership_plan is null then
    raise exception 'STUDIO_SUBSCRIPTION_REQUIRED' using errcode='42501';
  end if;
  project_limit:=case membership_plan when 'studio' then 8 when 'agency' then 16 else 30 end;
  if p_targets is null or jsonb_typeof(p_targets)<>'array'
    or jsonb_array_length(p_targets)<1 or jsonb_array_length(p_targets)>project_limit then
    raise exception 'INVALID_PROJECT_SELECTION' using errcode='P0001';
  end if;
  if p_style is null or jsonb_typeof(p_style)<>'object'
    or (p_style-array['theme','accentColor','titleFont']::text[]) <> '{}'::jsonb then
    raise exception 'INVALID_STUDIO_STYLE' using errcode='P0001';
  end if;
  chosen_theme:=p_style->>'theme';
  chosen_color:=p_style->>'accentColor';
  chosen_font:=p_style->>'titleFont';
  if chosen_theme is null or chosen_theme not in ('ultraviolet','emerald','sunset','ink','paper')
    or chosen_color is null or chosen_color !~ '^#[0-9a-fA-F]{6}$'
    or chosen_font is null or chosen_font not in ('auto','manrope','georgia','arial') then
    raise exception 'INVALID_STUDIO_STYLE' using errcode='P0001';
  end if;
  -- Lock rows in deterministic order to avoid concurrent deadlocks. Any
  -- invalid selection or optimistic concurrency mismatch aborts *all* updates.
  for requested in
    select elem.value from jsonb_array_elements(p_targets) as elem(value)
    order by elem.value->>'id'
  loop
    if jsonb_typeof(requested)<>'object'
      or (requested->>'id') is null
      or (requested->>'id') !~ '^[a-fA-F0-9-]{36}$'
      or (requested->>'version') is null
      or (requested->>'version') !~ '^[1-9][0-9]{0,7}$' then
      raise exception 'INVALID_PROJECT_SELECTION' using errcode='P0001';
    end if;
    target_id:=(requested->>'id')::uuid;
    expected_version:=(requested->>'version')::integer;
    if target_id=any(selected) then
      raise exception 'DUPLICATE_PROJECT_SELECTION' using errcode='P0001';
    end if;
    selected:=array_append(selected,target_id);
    select * into target from public.anons_studio_projects p
      where p.id=target_id and p.owner_id=uid and p.archived=false
      for update;
    if not found then
      raise exception 'PROJECT_NOT_AVAILABLE' using errcode='42501';
    end if;
    if target.version<>expected_version then
      raise exception 'VERSION_CONFLICT' using errcode='P0001';
    end if;
    if jsonb_typeof(target.snapshot->'cards')<>'array'
      or jsonb_array_length(target.snapshot->'cards')<1
      or jsonb_array_length(target.snapshot->'cards')>8
      or exists(select 1 from jsonb_array_elements(target.snapshot->'cards') c
                where jsonb_typeof(c.value)<>'object') then
      raise exception 'INVALID_PROJECT_SNAPSHOT' using errcode='P0001';
    end if;
    select jsonb_agg(c.value || jsonb_build_object(
      'theme',chosen_theme,'accentColor',chosen_color,'titleFont',chosen_font
    ) order by c.ordinality)
    into revised_cards
    from jsonb_array_elements(target.snapshot->'cards') with ordinality as c(value,ordinality);
    revised_snapshot:=target.snapshot || jsonb_build_object(
      'cards',revised_cards,
      'theme',chosen_theme,
      'accentColor',chosen_color,
      'titleFont',chosen_font
    );
    -- Keep the exact old content as a restorable checkpoint first.
    insert into public.anons_studio_project_revisions(
      project_id,owner_id,version,title,snapshot
    ) values (
      target.id,uid,target.version,target.title,target.snapshot
    ) on conflict (project_id,version) do nothing;
    update public.anons_studio_projects p
      set snapshot=revised_snapshot,version=target.version+1,updated_at=now()
      where p.id=target.id and p.owner_id=uid and p.version=expected_version;
    if not found then
      raise exception 'VERSION_CONFLICT' using errcode='P0001';
    end if;
    delete from public.anons_studio_project_revisions r
      where r.project_id=target.id and r.id in (
        select old.id from public.anons_studio_project_revisions old
        where old.project_id=target.id order by old.version desc offset 15
      );
    changed:=changed+1;
  end loop;
  return changed;
end
$$;
revoke all on function public.anons_studio_studio_apply_brand(jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.anons_studio_studio_apply_brand(jsonb,jsonb) to authenticated;
comment on function public.anons_studio_studio_apply_brand(jsonb,jsonb) is
  'Atomic membership-verified Studio/Agency/Ultimate brand patch (8/16/30 own projects), version checks and checkpoints.';
