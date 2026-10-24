begin;

-- Keep late charges, lost-item assessments, and damage assessments as separate
-- auditable rows. Older records are classified conservatively from their notes.
alter table public.fines add column if not exists fine_type text;
update public.fines
set fine_type = case
  when physical_book_request_id is null then 'other'
  when fine_reason is null or trim(fine_reason) = '' then 'late_fee'
  when fine_reason ilike '%damage%' then 'damage'
  when fine_reason ilike '%lost%' then 'lost_item'
  else 'other'
end
where fine_type is null;    
alter table public.fines alter column fine_type set default 'other';
alter table public.fines alter column fine_type set not null;
alter table public.fines drop constraint if exists fines_fine_type_check;
alter table public.fines add constraint fines_fine_type_check
  check (fine_type in ('late_fee', 'lost_item', 'damage', 'other'));

drop index if exists public.idx_fines_physical_request;
create index if not exists fines_physical_request_type_idx
  on public.fines(physical_book_request_id, fine_type)
  where physical_book_request_id is not null;
create unique index if not exists fines_one_late_fee_per_physical_loan
  on public.fines(physical_book_request_id)
  where physical_book_request_id is not null and fine_type = 'late_fee';
create unique index if not exists fines_one_assessment_per_physical_loan
  on public.fines(physical_book_request_id, fine_type)
  where physical_book_request_id is not null and fine_type in ('lost_item', 'damage');

-- Preserve one automatically recalculated overdue charge while allowing separate
-- staff-assessed charges to remain independently reviewable and payable.
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
    raise exception 'The approved general-circulation overdue rate is PHP 5.00 per chargeable day.';
  end if;
  can_process_all := public.is_library_staff()
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
        physical_book_request_id, borrow_request_id, student_id, amount,
        status, created_at, fine_type, fine_reason
      ) values (
        loan.id, null, loan.student_id, fine_amount, 'unpaid', now(),
        'late_fee', 'Automatic overdue charge under the published library policy.'
      )
      on conflict (physical_book_request_id)
        where physical_book_request_id is not null and fine_type = 'late_fee'
      do update set amount = excluded.amount
      where public.fines.status <> 'paid';
    else
      update public.fines
      set status = 'waived',
          waived_at = now(),
          waiver_reason = 'Recalculated under the approved policy; no chargeable overdue days remain.'
      where physical_book_request_id = loan.id
        and fine_type = 'late_fee'
        and status = 'unpaid';
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
        and (request.status = 'lost' or (request.status in ('checked_out', 'return_pending') and request.due_date < now()))
    ) or (
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

-- Lost-item fees are staff assessments, separate from automatically calculated
-- overdue charges. Never merge unrelated fee components into a single row.
create or replace function public.admin_add_lost_book_fine(
  p_request_id bigint, p_amount numeric, p_reason text
) returns public.fines
language plpgsql security definer set search_path = public
as $$
declare target_request public.physical_book_requests; saved_fine public.fines;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter an assessed lost-item charge greater than zero and no more than 100,000'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then raise exception 'Enter the assessment reason (1 to 500 characters)'; end if;
  select * into target_request from public.physical_book_requests where id = p_request_id and status = 'lost' for update;
  if target_request.id is null then raise exception 'An assessed lost-item charge can only be added to a lost physical book'; end if;
  insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
  values (target_request.id, null, target_request.student_id, round(p_amount, 2), 'unpaid', now(), 'lost_item', trim(p_reason))
  returning * into saved_fine;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'lost_item_charge_assessed', 'physical_book_request', target_request.id,
    jsonb_build_object('fine_id', saved_fine.id, 'amount', saved_fine.amount, 'reason', saved_fine.fine_reason));
  return saved_fine;
end;
$$;
revoke all on function public.admin_add_lost_book_fine(bigint, numeric, text) from public, anon;
grant execute on function public.admin_add_lost_book_fine(bigint, numeric, text) to authenticated;

-- One atomic librarian action records physical inspection, copy disposition,
-- any assessed charge, and an inspection note in the durable loan ledger.
create or replace function public.admin_inspect_physical_return(
  p_request_id bigint,
  p_copy_condition text,
  p_assessed_amount numeric default 0,
  p_assessment_reason text default null
) returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare target_request public.physical_book_requests; saved_request public.physical_book_requests;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'lost') then raise exception 'Choose available, damaged, or lost'; end if;
  if p_copy_condition in ('damaged', 'lost') then
    if p_assessed_amount is null or p_assessed_amount < 0 or p_assessed_amount > 100000 then raise exception 'Enter a non-negative assessed amount no greater than 100,000'; end if;
    if nullif(trim(coalesce(p_assessment_reason, '')), '') is null or char_length(trim(p_assessment_reason)) > 500 then raise exception 'Record the inspection or assessment reason (1 to 500 characters)'; end if;
    if p_copy_condition = 'lost' and p_assessed_amount <= 0 then raise exception 'Enter the staff-assessed lost-item charge'; end if;
  elsif coalesce(p_assessed_amount, 0) <> 0 or nullif(trim(coalesce(p_assessment_reason, '')), '') is not null then
    raise exception 'An assessment is only recorded for a damaged or lost item';
  end if;

  perform public.calculate_overdue_fines();
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status = 'lost' and p_copy_condition <> 'lost' then
    return target_request;
  end if;

  if target_request.status in ('checked_out', 'return_pending') then
    perform public.admin_close_physical_loan(p_request_id, p_copy_condition);
  elsif not (target_request.status = 'lost' and p_copy_condition = 'lost') then
    raise exception 'This physical loan is no longer awaiting return inspection';
  end if;

  select * into saved_request from public.physical_book_requests where id = p_request_id;
  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
    case when p_copy_condition = 'available' then 'Return inspection: copy checked and available.'
         when p_copy_condition = 'damaged' then 'Damage assessment: ' || trim(p_assessment_reason)
         else 'Lost-item assessment: ' || trim(p_assessment_reason) end),
      updated_at = now()
  where request_id = p_request_id;

  if p_assessed_amount > 0 and p_copy_condition in ('damaged', 'lost') then
    insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
    values (p_request_id, null, saved_request.student_id, round(p_assessed_amount, 2), 'unpaid', now(),
      case when p_copy_condition = 'damaged' then 'damage' else 'lost_item' end,
      trim(p_assessment_reason));
  end if;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'physical_return_inspected', 'physical_book_request', p_request_id,
    jsonb_build_object(
      'copy_condition', p_copy_condition,
      'assessed_amount', coalesce(p_assessed_amount, 0),
      'assessment_reason', nullif(trim(coalesce(p_assessment_reason, '')), '')
    )
  );
  return saved_request;
end;
$$;
revoke all on function public.admin_inspect_physical_return(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_inspect_physical_return(bigint, text, numeric, text) to authenticated;

commit;
