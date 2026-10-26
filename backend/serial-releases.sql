-- Original serials: private manuscript, server-clock release. Apply separately from schema.sql.
-- No manuscript bodies belong in Git after the first 50 chapters.
begin;
create table public.serial_editions (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  total_chapters integer not null check (total_chapters between 1 and 10000),
  initial_chapters integer not null check (initial_chapters between 1 and total_chapters),
  timezone text not null default 'Europe/Moscow' check (timezone = 'Europe/Moscow'),
  launch_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.serial_chapters (
  novel_slug text not null references public.serial_editions(slug),
  number integer not null check (number > 0),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  body text not null check (char_length(body) between 4000 and 5090 and body = btrim(body)),
  primary key (novel_slug, number)
);

-- Chapter 51: noon on the day after launch in Moscow; chapter 247: day 197.
-- All conversions name the timezone; the database/session timezone is irrelevant.
create function public.serial_release_at(launch timestamptz, chapter integer, initial integer, zone text)
returns timestamptz language sql immutable strict security invoker set search_path = '' as $$
  select case when chapter <= initial then launch else
    ((((launch at time zone zone)::date + (chapter - initial)) + time '12:00') at time zone zone)
  end
$$;
revoke all on function public.serial_release_at(timestamptz, integer, integer, text) from public;
grant execute on function public.serial_release_at(timestamptz, integer, integer, text)
  to anon, authenticated, service_role;

create function public.check_serial_chapter() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare edition public.serial_editions;
begin
  select * into edition from public.serial_editions
    where slug = case when tg_op = 'DELETE' then old.novel_slug else new.novel_slug end for update;
  if tg_op = 'DELETE' then
    if edition.launch_at is not null then raise exception 'An activated serial cannot lose a chapter'; end if;
    return old;
  end if;
  if new.number > edition.total_chapters then raise exception 'Chapter exceeds the edition length'; end if;
  if tg_op = 'INSERT' and edition.launch_at is not null then
    raise exception 'An activated serial already has its complete manuscript';
  end if;
  if tg_op = 'UPDATE' and (new.novel_slug <> old.novel_slug or new.number <> old.number) then
    raise exception 'Chapter identity is immutable';
  end if;
  return new;
end
$$;
revoke all on function public.check_serial_chapter() from public, anon, authenticated;
create trigger check_serial_chapter before insert or update or delete on public.serial_chapters
for each row execute function public.check_serial_chapter();

create function public.check_serial_launch() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare stored integer;
begin
  if tg_op = 'INSERT' and new.launch_at is not null then
    raise exception 'Create the draft edition and its complete manuscript before activation';
  end if;
  if tg_op = 'UPDATE' and old.launch_at is not null and
    row(new.launch_at, new.total_chapters, new.initial_chapters, new.timezone, new.slug)
      is distinct from row(old.launch_at, old.total_chapters, old.initial_chapters, old.timezone, old.slug) then
    raise exception 'An activated release schedule is immutable';
  end if;
  if tg_op = 'UPDATE' and old.launch_at is null and new.launch_at is not null then
    if new.launch_at < clock_timestamp() - interval '1 minute' then
      raise exception 'A serial launch cannot be backdated';
    end if;
    select count(*) into stored from public.serial_chapters where novel_slug = new.slug;
    if stored <> new.total_chapters or
      exists (select 1 from public.serial_chapters where novel_slug = new.slug and number > new.total_chapters) then
      raise exception 'Activation requires every chapter of the complete manuscript';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.check_serial_launch() from public, anon, authenticated;
create trigger check_serial_launch before insert or update on public.serial_editions
for each row execute function public.check_serial_launch();

alter table public.serial_editions enable row level security;
alter table public.serial_chapters enable row level security;
revoke all on public.serial_editions, public.serial_chapters from anon, authenticated;
grant select on public.serial_editions, public.serial_chapters to anon, authenticated;
grant all on public.serial_editions, public.serial_chapters to service_role;
create policy serial_schedule_public on public.serial_editions
  for select to anon, authenticated using (true);
create policy serial_body_released on public.serial_chapters for select to anon, authenticated
using (exists (
  select 1 from public.serial_editions e where e.slug = novel_slug and e.launch_at is not null
    and public.serial_release_at(e.launch_at, number, e.initial_chapters, e.timezone) <= (select now())
));

-- Draft only. Activation is a separate, guarded operation after all 247 bodies
-- are written, checked, privately imported, and the initial 50 are deployed.
insert into public.serial_editions (slug, total_chapters, initial_chapters)
  values ('the-latency-of-tomorrow', 247, 50);
commit;
