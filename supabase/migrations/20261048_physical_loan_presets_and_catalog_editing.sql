begin;

-- Standard physical lending durations. Keep each title's fee independently
-- configurable while guaranteeing the request RPC accepts only these presets.
insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
select book.id, duration.days, 0, true
from public.books book
cross join unnest(array[1, 3, 5, 7, 14, 30]) as duration(days)
where book.catalog_type in ('physical', 'hybrid')
on conflict (book_id, duration_days) do update set is_active = true;

create or replace function public.initialize_physical_book_loan_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.catalog_type in ('physical', 'hybrid') then
    insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
    select new.id, duration.days, 0, true
    from unnest(array[1, 3, 5, 7, 14, 30]) as duration(days)
    on conflict (book_id, duration_days) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_physical_book_loan_options on public.books;
create trigger initialize_physical_book_loan_options
after insert or update of catalog_type on public.books
for each row execute function public.initialize_physical_book_loan_options();
revoke all on function public.initialize_physical_book_loan_options() from public, anon, authenticated;

create or replace function public.admin_set_physical_loan_option(
  p_book_id bigint,
  p_duration_days integer,
  p_fee_amount numeric,
  p_is_active boolean default true
)
returns public.physical_loan_options
language plpgsql
security definer
set search_path = public
as $$
declare saved_option public.physical_loan_options;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_duration_days not in (1, 3, 5, 7, 14, 30) then raise exception 'Choose a supported loan duration'; end if;
  if p_fee_amount is null or p_fee_amount < 0 or p_fee_amount > 100000 then
    raise exception 'Enter a non-negative fee no greater than 100,000';
  end if;
  if not exists (select 1 from public.books where id = p_book_id and catalog_type in ('physical', 'hybrid')) then
    raise exception 'Choose a physical or hybrid catalog title';
  end if;
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  values (p_book_id, p_duration_days, round(p_fee_amount, 2), coalesce(p_is_active, true))
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
  returning * into saved_option;
  return saved_option;
end;
$$;
revoke all on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) from public, anon;
grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;

-- Save all title periods together so a partial network failure cannot leave a
-- mixed set of stale and new fees.
create or replace function public.admin_set_physical_loan_options(p_book_id bigint, p_options jsonb)
returns setof public.physical_loan_options
language plpgsql
security definer
set search_path = public
as $$
declare option_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.books where id = p_book_id and catalog_type in ('physical', 'hybrid')) then
    raise exception 'Choose a physical or hybrid catalog title';
  end if;
  if jsonb_typeof(p_options) <> 'array' then raise exception 'Loan options must be a list'; end if;

  select count(*) into option_count
  from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric);
  if option_count <> 6 or exists (
    select 1
    from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)
    where duration_days not in (1, 3, 5, 7, 14, 30)
       or fee_amount is null or fee_amount < 0 or fee_amount > 100000
  ) or (select count(distinct option_row.duration_days)
        from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)) <> 6 then
    raise exception 'Provide one valid non-negative fee for each duration: 1, 3, 5, 7, 14, and 30 days';
  end if;

  return query
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  select p_book_id, option_row.duration_days, round(option_row.fee_amount, 2), true
  from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = true
  returning *;
end;
$$;
revoke all on function public.admin_set_physical_loan_options(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_physical_loan_options(bigint, jsonb) to authenticated;

-- The current policy trigger was introduced in 20261036 with a fixed 14-day
-- rule. Replace only that duration check and retain its fine/hold validation.
do $$
declare function_definition text;
begin
  select pg_get_functiondef(routine.oid) into function_definition
  from pg_proc routine join pg_namespace nsp on nsp.oid = routine.pronamespace
  where nsp.nspname = 'public' and routine.proname = 'enforce_library_borrowing_policy';
  if function_definition is null then raise exception 'Physical borrowing policy function was not found'; end if;
  if position('new.duration_days <> 14' in function_definition) = 0 then
    raise exception 'Unexpected physical borrowing policy; inspect before applying duration presets';
  end if;
  function_definition := replace(function_definition,
    'new.duration_days <> 14', 'new.duration_days not in (1, 3, 5, 7, 14, 30)');
  function_definition := replace(function_definition,
    'General-circulation physical books have a 14-day loan period.',
    'Choose a supported physical-book loan period: 1, 3, 5, 7, 14, or 30 days.');
  execute function_definition;
end;
$$;

commit;
