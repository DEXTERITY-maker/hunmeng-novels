-- Stage 10: Studio-only coordinated visual identity across private cloud projects.
-- No purchase/order updates, no user-created privilege flags. Entire operation is atomic.
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
begin
  if uid is null or not exists (
    select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null
  ) then
    raise exception 'VERIFIED_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.anons_studio_memberships m
    where m.user_id=uid and m.plan='studio'
      and m.status in ('active','trialing') and m.current_period_end>now()
  ) then
    raise exception 'STUDIO_SUBSCRIPTION_REQUIRED' using errcode='42501';
  end if;
  if p_targets is null or jsonb_typeof(p_targets)<>'array'
    or jsonb_array_length(p_targets)<1 or jsonb_array_length(p_targets)>8 then
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
  'Atomic Studio membership-verified style patch to <=8 private cloud projects with version checks and restorable checkpoints.';
