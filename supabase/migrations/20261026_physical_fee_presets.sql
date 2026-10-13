-- Keep physical-book fee periods aligned with the digital access presets.

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
declare
  saved_option public.physical_loan_options;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) or p_fee_amount < 0 then
    raise exception 'Choose a supported duration and non-negative fee';
  end if;
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  values (p_book_id, p_duration_days, p_fee_amount, p_is_active)
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
  returning * into saved_option;
  return saved_option;
end;
$$;

grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;
