begin;

create or replace function public.notify_staff_of_physical_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' then return new; end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id, 'physical_request_created', 'New physical-book request',
    'A member submitted a physical-book request that needs payment and checkout review.', new.id
  from public.profiles p
  where p.role in ('admin', 'librarian');
  return new;
end;
$$;

do $$
declare
  definition text;
  updated_definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enforce_library_borrowing_policy'
    and p.prorettype = 'pg_catalog.trigger'::regtype;
  if definition is null then raise exception 'Physical borrowing policy trigger was not found'; end if;

  updated_definition := replace(definition,
    'member_id <> auth.uid() and not public.is_admin()',
    'member_id <> auth.uid() and not public.is_admin() and not (tg_table_name = ''physical_book_requests'' and public.is_librarian())');
  if updated_definition = definition then
    raise exception 'Could not verify librarian borrowing authorization; inspect the borrowing policy trigger before applying';
  end if;
  execute updated_definition;
end;
$$;

do $$
declare
  definition text;
  updated_definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_renew_physical_loan'
    and p.proargtypes = '20 23 1700 25 16'::oidvector;

  if definition is null then
    raise exception 'Expected librarian renewal RPC was not found';
  end if;

  updated_definition := regexp_replace(definition,
    '>\s*100([.]0+)?\s+then',
    '> 0 then',
    'g');
  updated_definition := replace(updated_definition,
    'Unpaid fines above PHP 100 block physical borrowing and renewals',
    'Clear all unpaid physical fines before renewing');

  if position('sum(f.amount)' in lower(updated_definition)) = 0
    or updated_definition !~* '>\s*0([.]0+)?\s+then' then
    raise exception 'Could not verify the physical renewal fine hold; inspect public.admin_renew_physical_loan before applying';
  end if;
  if updated_definition <> definition then
    execute updated_definition;
  end if;
end;
$$;

create or replace function public.admin_issue_physical_copy(
  p_student_id uuid,
  p_copy_code text,
  p_duration_days integer,
  p_amount_paid numeric,
  p_payment_notes text,
  p_id_card_presented boolean
)
returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  target_copy public.physical_book_copies;
  target_book public.books;
  target_option public.physical_loan_options;
  saved_request public.physical_book_requests;
  checked_out_at_time timestamptz := now();
  unpaid_total numeric(10, 2);
  active_physical_count integer;
begin
  if not public.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_id_card_presented is distinct from true then
    raise exception 'Confirm that the member presented a physical institutional ID card';
  end if;
  if nullif(trim(coalesce(p_copy_code, '')), '') is null
    or char_length(trim(p_copy_code)) > 80 then
    raise exception 'Enter a valid physical copy accession tag';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 then
    raise exception 'Enter a valid amount received';
  end if;
  if char_length(coalesce(p_payment_notes, '')) > 500 then
    raise exception 'Payment notes are limited to 500 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('physical-member:' || p_student_id::text, 0));
  perform public.calculate_overdue_fines();

  select * into target_profile
  from public.profiles
  where id = p_student_id and role in ('student', 'faculty');
  if target_profile.id is null then raise exception 'Choose an active student or faculty member'; end if;

  select * into target_copy
  from public.physical_book_copies
  where lower(copy_code) = lower(trim(p_copy_code))
  for update;
  if target_copy.id is null then raise exception 'No physical copy matches that accession tag'; end if;
  if target_copy.status <> 'available' then
    raise exception 'Copy % is %, not available for checkout', target_copy.copy_code, target_copy.status;
  end if;

  select * into target_book
  from public.books
  where id = target_copy.book_id
    and catalog_type in ('physical', 'hybrid')
    and not is_archived;
  if target_book.id is null then raise exception 'This title is not available for circulation'; end if;

  select * into target_option
  from public.physical_loan_options
  where book_id = target_copy.book_id
    and duration_days = p_duration_days
    and is_active
  for share;
  if target_option.id is null then raise exception 'Choose an active loan period configured for this title'; end if;
  if round(p_amount_paid, 2) <> round(target_option.fee_amount, 2) then
    raise exception 'Amount received must equal the configured loan fee';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = p_student_id
      and (
        status = 'lost'
        or (status in ('checked_out', 'return_pending') and due_date < checked_out_at_time)
      )
  ) then
    raise exception 'Resolve overdue or lost physical loans before issuing another book';
  end if;

  select coalesce(sum(amount), 0) into unpaid_total
  from public.fines
  where student_id = p_student_id
    and physical_book_request_id is not null
    and status = 'unpaid';
  if unpaid_total > 0 then raise exception 'Clear all unpaid physical fines before issuing another book'; end if;

  select count(*)::integer into active_physical_count
  from public.physical_book_requests
  where student_id = p_student_id
    and status in ('checked_out', 'return_pending');
  if active_physical_count >= 3 then
    raise exception 'The physical borrowing limit of 3 active books has been reached';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = p_student_id
      and book_id = target_copy.book_id
      and status in ('pending', 'checked_out', 'return_pending')
  ) then
    raise exception 'This member already has a pending request or active loan for this title';
  end if;

  update public.physical_book_copies
  set status = 'borrowed',
      checked_out_at = checked_out_at_time,
      due_date = checked_out_at_time + make_interval(days => target_option.duration_days)
  where id = target_copy.id;

  insert into public.physical_book_requests (
    student_id, book_id, loan_option_id, copy_id, duration_days, fee_amount,
    payment_method, payment_status, status, checked_out_at, due_date,
    payment_received_amount, payment_verified_at, payment_verified_by, payment_notes
  ) values (
    p_student_id, target_copy.book_id, target_option.id, target_copy.id,
    target_option.duration_days, target_option.fee_amount, 'cash', 'paid', 'checked_out',
    checked_out_at_time, checked_out_at_time + make_interval(days => target_option.duration_days),
    round(p_amount_paid, 2), checked_out_at_time, auth.uid(),
    nullif(trim(coalesce(p_payment_notes, '')), '')
  ) returning * into saved_request;

  update public.physical_book_requests
  set receipt_number = 'SL-' || to_char(checked_out_at_time, 'YYYYMMDD') || '-' || lpad(saved_request.id::text, 6, '0')
  where id = saved_request.id
  returning * into saved_request;

  insert into public.physical_book_loan_history (
    request_id, student_id, book_id, copy_id, duration_days, fee_amount,
    payment_method, payment_status, checked_out_at, due_date, status,
    receipt_number, checked_out_by, notes
  ) values (
    saved_request.id, saved_request.student_id, saved_request.book_id, saved_request.copy_id,
    saved_request.duration_days, saved_request.fee_amount, saved_request.payment_method,
    saved_request.payment_status, saved_request.checked_out_at, saved_request.due_date,
    'checked_out', saved_request.receipt_number, auth.uid(), saved_request.payment_notes
  );

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_checkout_issued_by_librarian', 'physical_book_request', saved_request.id,
    jsonb_build_object(
      'student_id', p_student_id,
      'copy_id', target_copy.id,
      'copy_code', target_copy.copy_code,
      'duration_days', target_option.duration_days,
      'fee_amount', target_option.fee_amount,
      'amount_received', round(p_amount_paid, 2),
      'id_card_presented', true
    ));

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (p_student_id, 'physical_checkout', 'Physical book checked out',
    'Your physical-book checkout is complete. Your receipt is available in your library account.',
    saved_request.id);
  return saved_request;
end;
$$;

revoke all on function public.admin_issue_physical_copy(uuid, text, integer, numeric, text, boolean)
  from public, anon;
grant execute on function public.admin_issue_physical_copy(uuid, text, integer, numeric, text, boolean)
  to authenticated;

create or replace function public.admin_return_physical_loans(
  p_student_id uuid,
  p_request_ids bigint[],
  p_id_card_presented boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request record;
  returned_count integer := 0;
begin
  if not public.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_id_card_presented is distinct from true then
    raise exception 'Confirm that the member presented a physical institutional ID card';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) < 1 or cardinality(p_request_ids) > 10 then
    raise exception 'Select between 1 and 10 physical loans to return';
  end if;
  if cardinality(p_request_ids) <> (select count(distinct request_id) from unnest(p_request_ids) as items(request_id)) then
    raise exception 'A physical loan can only be selected once';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('physical-member:' || p_student_id::text, 0));

  for target_request in
    select r.id
    from public.physical_book_requests r
    where r.id = any(p_request_ids)
      and r.student_id = p_student_id
      and r.status in ('checked_out', 'return_pending')
      and r.copy_id is not null
    order by r.id
    for update
  loop
    perform public.admin_inspect_physical_return(target_request.id, 'available', 0, null, true);
    returned_count := returned_count + 1;
  end loop;

  if returned_count <> cardinality(p_request_ids) then
    raise exception 'One or more selected copies are not active loans for this member';
  end if;
  return returned_count;
end;
$$;

revoke all on function public.admin_return_physical_loans(uuid, bigint[], boolean)
  from public, anon;
grant execute on function public.admin_return_physical_loans(uuid, bigint[], boolean)
  to authenticated;

commit;
