-- Anons Studio private personal styles. Does not touch projects or billing.
-- The browser uses only a publishable key; ownership is enforced by RLS.
create table public.anons_studio_styles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  style jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anons_styles_name_check check (char_length(btrim(name)) between 2 and 48),
  constraint anons_styles_style_check check (
    jsonb_typeof(style) = 'object'
    and octet_length(style::text) <= 32000
    and style->>'template' in ('aurora','editorial','spotlight','pulse','minimal','bulletin')
    and style->>'theme' in ('ultraviolet','emerald','sunset','ink','paper')
    and (style - array[
      'template','theme','accentColor','alignment','headingScale','decorations',
      'photoOpacity','titleFont','descriptionScale','layerOffsets','graphicElements',
      'decorationLevel','textSpacing','composition','highlightStyle','highlightIcons',
      'featuredHighlight','lockedLayers','layers','layerOrder'
    ]::text[]) = '{}'::jsonb
  )
);
comment on table public.anons_studio_styles is
  'Private per-user Anons Studio visual presets, separated from publication content and billing.';
create index anons_styles_owner_idx on public.anons_studio_styles(owner_id,updated_at desc);
create unique index anons_styles_owner_name_idx on public.anons_studio_styles(owner_id,lower(btrim(name)));
alter table public.anons_studio_styles enable row level security;
revoke all on table public.anons_studio_styles from anon, authenticated;
grant select, insert, update, delete on table public.anons_studio_styles to authenticated;
create policy "anons_styles_select_own" on public.anons_studio_styles
 for select to authenticated using ((select auth.uid()) = owner_id);
create policy "anons_styles_insert_own" on public.anons_studio_styles
 for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "anons_styles_update_own" on public.anons_studio_styles
 for update to authenticated using ((select auth.uid()) = owner_id)
 with check ((select auth.uid()) = owner_id);
create policy "anons_styles_delete_own" on public.anons_studio_styles
 for delete to authenticated using ((select auth.uid()) = owner_id);
