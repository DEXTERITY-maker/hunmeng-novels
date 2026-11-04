-- Include three Business template IDs in previously private visual styles.
-- Preserve existing rows and all RLS policies.
alter table public.anons_studio_styles drop constraint anons_styles_style_check;
alter table public.anons_studio_styles add constraint anons_styles_style_check check (
  jsonb_typeof(style)='object'
  and octet_length(style::text)<=32000
  and style->>'template' in (
    'aurora','editorial','spotlight','pulse','minimal','bulletin',
    'business-brief','business-pitch','business-report'
  )
  and style->>'theme' in ('ultraviolet','emerald','sunset','ink','paper')
  and (style-array[
    'template','theme','accentColor','alignment','headingScale','decorations',
    'photoOpacity','titleFont','descriptionScale','layerOffsets','graphicElements',
    'decorationLevel','textSpacing','composition','highlightStyle','highlightIcons',
    'featuredHighlight','lockedLayers','layers','layerOrder'
  ]::text[])='{}'::jsonb
);
