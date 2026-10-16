begin;

alter table public.fines
  alter column borrow_request_id drop not null,
  add column if not exists physical_book_request_id bigint references public.physical_book_requests(id) on delete cascade,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists waived_at timestamptz,
  add column if not exists waiver_reason text;

alter table public.fines drop constraint if exists fines_status_check;
alter table public.fines
  add constraint fines_status_check check (status in ('unpaid', 'paid', 'waived'));
alter table public.fines drop constraint if exists fines_exactly_one_loan_check;
alter table public.fines
  add constraint fines_exactly_one_loan_check
  check (num_nonnulls(borrow_request_id, physical_book_request_id) = 1);
drop policy if exists fines_admin_update on public.fines;
revoke insert, update, delete on public.fines from authenticated;

create unique index if not exists idx_fines_physical_request
  on public.fines(physical_book_request_id)
  where physical_book_request_id is not null;

update public.fines
set status = 'waived',
    waived_at = now(),
    waiver_reason = 'Digital loans do not accrue overdue fines under the approved library policy.'
where status = 'unpaid' and borrow_request_id is not null;

create table if not exists public.library_holidays (
  holiday_date date primary key,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.library_holidays enable row level security;
drop policy if exists library_holidays_read_authenticated on public.library_holidays;
create policy library_holidays_read_authenticated on public.library_holidays
  for select to authenticated using (true);
drop policy if exists library_holidays_staff_insert on public.library_holidays;
create policy library_holidays_staff_insert on public.library_holidays
  for insert to authenticated with check (public.is_admin());
drop policy if exists library_holidays_staff_delete on public.library_holidays;
create policy library_holidays_staff_delete on public.library_holidays
  for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.library_holidays to authenticated;

insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
select id, 14, 0, true
from public.books
where catalog_type in ('physical', 'hybrid')
on conflict (book_id, duration_days) do nothing;

update public.physical_loan_options
set is_active = false
where duration_days <> 14 and is_active;

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
  if p_duration_days <> 14 or p_fee_amount < 0 then
    raise exception 'General-circulation physical books use a 14-day loan period and a non-negative checkout fee';
  end if;
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  values (p_book_id, 14, p_fee_amount, p_is_active)
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
  returning * into saved_option;
  return saved_option;
end;
$$;
grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;

create or replace function public.enforce_library_borrowing_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
  unpaid_total numeric(10, 2);
  overdue_physical boolean;
begin
  member_id := new.student_id;
  if member_id is null then return new; end if;
  if member_id <> auth.uid() and not public.is_admin() then
    raise exception 'Members can only submit borrowing requests for their own account.';
  end if;

  perform public.calculate_overdue_fines();

  select coalesce(sum(amount), 0) into unpaid_total
  from public.fines
  where student_id = member_id and status = 'unpaid' and physical_book_request_id is not null;

  select exists (
    select 1
    from public.physical_book_requests
    where student_id = member_id
      and (
        status = 'lost'
        or (status in ('checked_out', 'return_pending') and due_date < now())
      )
  ) into overdue_physical;

  if tg_table_name = 'borrow_requests' then
    if overdue_physical or unpaid_total > 0 then
      raise exception 'New digital access is unavailable while an overdue physical item or unpaid physical fine remains.';
    end if;
  elsif tg_table_name = 'physical_book_waitlist' then
    if overdue_physical then
      raise exception 'Return overdue physical items before joining an availability queue.';
    end if;
    if unpaid_total >= 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is below ₱100.';
    end if;
  else
    if new.duration_days <> 14 then
      raise exception 'General-circulation physical books have a 14-day loan period.';
    end if;
    if overdue_physical then
      raise exception 'Return overdue physical items before requesting another physical book.';
    end if;
    if unpaid_total >= 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is below ₱100.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_digital_borrowing_policy on public.borrow_requests;
create trigger enforce_digital_borrowing_policy
before insert on public.borrow_requests
for each row execute function public.enforce_library_borrowing_policy();

drop trigger if exists enforce_physical_request_policy on public.physical_book_requests;
create trigger enforce_physical_request_policy
before insert on public.physical_book_requests
for each row execute function public.enforce_library_borrowing_policy();

drop trigger if exists enforce_physical_waitlist_policy on public.physical_book_waitlist;
create trigger enforce_physical_waitlist_policy
before insert on public.physical_book_waitlist
for each row execute function public.enforce_library_borrowing_policy();

create or replace function public.offer_next_physical_waitlist(p_book_id bigint, p_copy_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare next_member record;
begin
  perform public.calculate_overdue_fines();

  select waitlist.student_id into next_member
  from public.physical_book_waitlist waitlist
  where waitlist.book_id = p_book_id
    and not exists (
      select 1 from public.physical_book_requests request
      where request.student_id = waitlist.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    and (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = waitlist.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) < 100
  order by waitlist.created_at, waitlist.student_id
  limit 1;

  if next_member.student_id is not null then
    insert into public.notifications(user_id, event_type, title, message, reference_id)
    values (
      next_member.student_id, 'physical_book_available', 'A physical book is available',
      'A copy is available. Submit your request, then visit the library desk for payment and checkout confirmation.',
      p_book_id
    );
  end if;
  return null;
end;
$$;
revoke all on function public.offer_next_physical_waitlist(bigint, bigint) from public, anon, authenticated;
grant execute on function public.offer_next_physical_waitlist(bigint, bigint) to service_role;

create or replace function public.calculate_overdue_fines(daily_rate numeric default 5.00)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loan record;
  local_today date := (now() at time zone 'Asia/Manila')::date;
  due_local_date date;
  end_local_date date;
  fine_through date;
  chargeable_days integer;
  fine_amount numeric(10, 2);
  can_process_all boolean;
begin
  if daily_rate <> 5.00 then
    raise exception 'The approved general-circulation overdue rate is ₱5.00 per chargeable day.';
  end if;

  can_process_all := public.is_admin()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  if auth.uid() is null and not can_process_all then
    raise exception 'Authenticated member or library staff access required';
  end if;

  for loan in
    select id, student_id, copy_id, due_date, returned_at, status
    from public.physical_book_requests
    where due_date is not null
      and status in ('checked_out', 'return_pending', 'returned')
      and (can_process_all or student_id = auth.uid())
    for update
  loop
    due_local_date := (loan.due_date at time zone 'Asia/Manila')::date;
    end_local_date := case
      when loan.status = 'returned' and loan.returned_at is not null
        then (loan.returned_at at time zone 'Asia/Manila')::date
      else local_today
    end;

    fine_through := least(end_local_date, due_local_date + 30);
    if end_local_date > due_local_date + 2 then
      select count(*)::integer into chargeable_days
      from generate_series(due_local_date + 3, fine_through, interval '1 day') as overdue_day(day)
      where extract(dow from overdue_day.day) <> 0
        and not exists (
          select 1 from public.library_holidays holiday
          where holiday.holiday_date = overdue_day.day::date
        );
    else
      chargeable_days := 0;
    end if;

    fine_amount := least(500.00, chargeable_days * 5.00);
    if fine_amount > 0 then
      insert into public.fines(
        physical_book_request_id, borrow_request_id, student_id, amount, status, created_at
      ) values (
        loan.id, null, loan.student_id, fine_amount, 'unpaid', now()
      )
      on conflict (physical_book_request_id) where physical_book_request_id is not null
      do update set amount = excluded.amount
      where public.fines.status <> 'paid';
    else
      update public.fines
      set status = 'waived',
          waived_at = now(),
          waiver_reason = 'Recalculated under the approved policy; no chargeable overdue days remain.'
      where physical_book_request_id = loan.id and status = 'unpaid';
    end if;

    if loan.status in ('checked_out', 'return_pending')
      and local_today >= due_local_date + 30 then
      update public.physical_book_requests set status = 'lost'
      where id = loan.id and status in ('checked_out', 'return_pending');
      update public.physical_book_copies
      set status = 'lost', checked_out_at = null, due_date = null
      where id = loan.copy_id;
      insert into public.notifications(user_id, event_type, title, message, reference_id)
      values (
        loan.student_id, 'physical_item_classified_lost', 'Physical book classified as lost',
        'This physical book has been overdue for 30 consecutive days. Late-fine accrual has stopped; contact the library to resolve the lost-item record.',
        loan.id
      );
    end if;
  end loop;

  delete from public.physical_book_waitlist waitlist
  where (can_process_all or waitlist.student_id = auth.uid())
    and (exists (
      select 1 from public.physical_book_requests request
      where request.student_id = waitlist.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    or (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = waitlist.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) >= 100);
end;
$$;

revoke all on function public.calculate_overdue_fines(numeric) from public, anon;
grant execute on function public.calculate_overdue_fines(numeric) to authenticated, service_role;

create or replace function public.admin_record_physical_fine_payment(p_fine_id bigint)
returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare paid_fine public.fines;
begin
  if not public.is_admin() then raise exception 'Librarian or administrator access required'; end if;
  select * into paid_fine
  from public.fines
  where id = p_fine_id and physical_book_request_id is not null
  for update;
  if paid_fine.id is null then raise exception 'Physical fine not found'; end if;
  if paid_fine.status <> 'unpaid' then raise exception 'This fine is no longer unpaid'; end if;
  if exists (
    select 1 from public.physical_book_requests
    where id = paid_fine.physical_book_request_id and status in ('checked_out', 'return_pending')
  ) then
    raise exception 'The physical book must be returned or classified as lost before payment can be recorded.';
  end if;
  update public.fines
  set status = 'paid', paid_at = now(), paid_by = auth.uid()
  where id = p_fine_id returning * into paid_fine;
  return paid_fine;
end;
$$;
revoke all on function public.admin_record_physical_fine_payment(bigint) from public, anon;
grant execute on function public.admin_record_physical_fine_payment(bigint) to authenticated;

commit;
