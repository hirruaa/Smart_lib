begin;

alter table public.library_holidays
  add column if not exists source text not null default 'manual',
  add column if not exists provider_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'library_holidays_source_check'
      and conrelid = 'public.library_holidays'::regclass
  ) then
    alter table public.library_holidays
      add constraint library_holidays_source_check check (source in ('manual', 'nager'));
  end if;
end;
$$;

create or replace function public.sync_library_holidays(p_year integer, p_holidays jsonb)
returns table (synced_count integer, preserved_manual_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  holiday_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 or p_holidays is null or jsonb_typeof(p_holidays) <> 'array' then
    raise exception 'Invalid holiday calendar';
  end if;

  holiday_count := jsonb_array_length(p_holidays);
  if holiday_count = 0 or holiday_count > 100 then
    raise exception 'Holiday calendar must contain between 1 and 100 dates';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_holidays) as item(holiday_date date, name text)
    where item.holiday_date is null
      or extract(year from item.holiday_date)::integer <> p_year
      or item.name is null
      or char_length(trim(item.name)) not between 1 and 120
  ) then
    raise exception 'Holiday dates or names are invalid';
  end if;
  if (
    select count(distinct item.holiday_date)
    from jsonb_to_recordset(p_holidays) as item(holiday_date date, name text)
  ) <> holiday_count then
    raise exception 'Holiday dates must be unique';
  end if;

  delete from public.library_holidays existing
  where existing.source = 'nager'
    and existing.holiday_date >= make_date(p_year, 1, 1)
    and existing.holiday_date < make_date(p_year + 1, 1, 1)
    and not exists (
      select 1
      from jsonb_to_recordset(p_holidays) as item(holiday_date date, name text)
      where item.holiday_date = existing.holiday_date
    );

  select count(*) into preserved_manual_count
  from public.library_holidays existing
  join jsonb_to_recordset(p_holidays) as item(holiday_date date, name text)
    on item.holiday_date = existing.holiday_date
  where existing.source = 'manual';

  insert into public.library_holidays (holiday_date, name, source, provider_synced_at, created_by)
  select item.holiday_date, trim(item.name), 'nager', now(), auth.uid()
  from jsonb_to_recordset(p_holidays) as item(holiday_date date, name text)
  on conflict (holiday_date) do update
    set name = excluded.name,
        provider_synced_at = excluded.provider_synced_at,
        created_by = excluded.created_by
    where public.library_holidays.source = 'nager';
  get diagnostics synced_count = row_count;

  return next;
end;
$$;

create or replace function public.set_manual_library_holiday(p_holiday_date date, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_holiday_date is null or p_name is null or char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'Holiday date and a name of 1 to 120 characters are required';
  end if;

  insert into public.library_holidays (holiday_date, name, source, provider_synced_at, created_by)
  values (p_holiday_date, trim(p_name), 'manual', null, auth.uid())
  on conflict (holiday_date) do update
    set name = excluded.name,
        source = 'manual',
        provider_synced_at = null,
        created_by = excluded.created_by;
end;
$$;

revoke all on function public.sync_library_holidays(integer, jsonb) from public;
revoke all on function public.set_manual_library_holiday(date, text) from public;
grant execute on function public.sync_library_holidays(integer, jsonb) to authenticated;
grant execute on function public.set_manual_library_holiday(date, text) to authenticated;

commit;
