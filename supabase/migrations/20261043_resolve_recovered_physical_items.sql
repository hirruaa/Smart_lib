begin;

-- Staff can close a disputed or incorrect physical fine with a required,
-- auditable reason. Members cannot edit or waive their own charges.
create or replace function public.admin_waive_physical_fine(
  p_fine_id bigint,
  p_reason text
) returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fine public.fines;
  loan_status text;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then
    raise exception 'Enter a waiver reason of 1 to 500 characters';
  end if;
  select * into target_fine from public.fines
  where id = p_fine_id and physical_book_request_id is not null for update;
  if target_fine.id is null then raise exception 'Physical fine not found'; end if;
  if target_fine.status <> 'unpaid' then raise exception 'Only an unpaid fine can be waived'; end if;
  select status into loan_status from public.physical_book_requests
  where id = target_fine.physical_book_request_id for update;
  if loan_status not in ('returned', 'lost') then
    raise exception 'Return the book or close its lost-item case before resolving this fine';
  end if;
  update public.fines
  set status = 'waived', waived_at = now(), waiver_reason = trim(p_reason)
  where id = p_fine_id returning * into target_fine;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_fine_waived', 'fine', target_fine.id,
    jsonb_build_object('physical_book_request_id', target_fine.physical_book_request_id,
      'student_id', target_fine.student_id, 'fine_type', target_fine.fine_type,
      'amount', target_fine.amount, 'reason', target_fine.waiver_reason));
  return target_fine;
end;
$$;
revoke all on function public.admin_waive_physical_fine(bigint, text) from public, anon;
grant execute on function public.admin_waive_physical_fine(bigint, text) to authenticated;

-- Recovered lost books must not keep an unpaid replacement assessment. If the
-- recovered copy is damaged, record its separate staff-assessed charge here.
drop function if exists public.admin_resolve_lost_physical_loan(bigint, text);
create function public.admin_resolve_lost_physical_loan(
  p_request_id bigint,
  p_copy_condition text,
  p_damage_amount numeric default 0,
  p_damage_reason text default null
) returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  waived_lost_amount numeric(10,2) := 0;
  paid_lost_amount numeric(10,2) := 0;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'withdrawn') then
    raise exception 'Choose a valid found-copy condition';
  end if;
  if p_copy_condition = 'damaged' then
    if p_damage_amount is null or p_damage_amount < 0 or p_damage_amount > 100000 then
      raise exception 'Enter a non-negative assessed damage charge no greater than 100,000';
    end if;
    if nullif(trim(coalesce(p_damage_reason, '')), '') is null or char_length(trim(p_damage_reason)) > 500 then
      raise exception 'Record the damage inspection and assessment reason (1 to 500 characters)';
    end if;
  elsif coalesce(p_damage_amount, 0) <> 0 or nullif(trim(coalesce(p_damage_reason, '')), '') is not null then
    raise exception 'Damage details are only accepted when the recovered copy is damaged';
  end if;

  select * into target_request from public.physical_book_requests
  where id = p_request_id and status = 'lost' for update;
  if target_request.id is null then raise exception 'Lost physical loan not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));

  select coalesce(sum(amount), 0) into paid_lost_amount
  from public.fines
  where physical_book_request_id = p_request_id and fine_type = 'lost_item' and status = 'paid';

  with waived_fines as (
    update public.fines
    set status = 'waived',
        waived_at = now(),
        waiver_reason = 'Lost item recovered and accepted by library staff; replacement assessment waived.'
    where p_copy_condition in ('available', 'damaged')
      and physical_book_request_id = p_request_id
      and fine_type = 'lost_item'
      and status = 'unpaid'
    returning amount
  ) select coalesce(sum(amount), 0) into waived_lost_amount from waived_fines;

  update public.physical_book_copies
  set status = p_copy_condition, checked_out_at = null, due_date = null
  where id = target_request.copy_id;
  update public.physical_book_requests
  set status = 'returned', returned_at = now()
  where id = p_request_id returning * into target_request;

  if p_copy_condition = 'damaged' and p_damage_amount > 0 then
    if exists (select 1 from public.fines where physical_book_request_id = p_request_id and fine_type = 'damage') then
      raise exception 'A damage assessment is already recorded for this physical loan';
    end if;
    insert into public.fines(
      physical_book_request_id, borrow_request_id, student_id, amount,
      status, created_at, fine_type, fine_reason
    ) values (
      p_request_id, null, target_request.student_id, round(p_damage_amount, 2),
      'unpaid', now(), 'damage', trim(p_damage_reason)
    );
  end if;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
      case when p_copy_condition = 'damaged'
        then 'Recovered lost item; damage assessment: ' || trim(p_damage_reason)
        else 'Recovered lost item; copy disposition: ' || p_copy_condition end),
      updated_at = now()
  where request_id = p_request_id;

  if p_copy_condition = 'available' then
    perform public.offer_next_physical_waitlist(target_request.book_id, target_request.copy_id);
  end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (
    target_request.student_id,
    'physical_hold_resolved',
    'Recovered book record resolved',
    case when p_copy_condition = 'withdrawn'
      then 'The library closed the lost-item case as unresolved. Any lost-item assessment and separate overdue charges remain due; contact library staff if you believe this is incorrect.'
      when paid_lost_amount > 0
      then 'The library recovered the lost book and resolved the circulation hold. A prior replacement payment remains recorded; contact the library cashier if it needs review.'
      else 'The library recovered the lost book and resolved the circulation hold. Any unpaid replacement assessment was waived. Any separate late fee remains due.' end,
    target_request.id
  );
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_copy_condition = 'withdrawn' then 'physical_lost_loan_closed' else 'physical_lost_loan_recovered' end, 'physical_book_request', target_request.id,
    jsonb_build_object(
      'book_id', target_request.book_id,
      'copy_id', target_request.copy_id,
      'copy_condition', p_copy_condition,
      'waived_lost_assessment_amount', waived_lost_amount,
      'previously_paid_lost_assessment_amount', paid_lost_amount,
      'damage_assessed_amount', case when p_copy_condition = 'damaged' then round(coalesce(p_damage_amount, 0), 2) else 0 end,
      'damage_assessment_reason', case when p_copy_condition = 'damaged' then nullif(trim(coalesce(p_damage_reason, '')), '') else null end
    ));
  return target_request;
end;
$$;

revoke all on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) to authenticated;

commit;
