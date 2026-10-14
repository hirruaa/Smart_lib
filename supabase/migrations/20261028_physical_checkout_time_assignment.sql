-- Physical requests express intent only; staff assigns a copy at checkout.

update public.physical_book_copies
set status = 'available', checked_out_at = null, due_date = null
where status = 'reserved';

update public.physical_book_requests
set copy_id = null, reservation_expires_at = null
where status = 'pending';

update public.physical_book_waitlist
set offered_copy_id = null, offer_expires_at = null
where offered_copy_id is not null;

alter table public.physical_book_copies drop constraint if exists physical_book_copies_status_check;
alter table public.physical_book_copies add constraint physical_book_copies_status_check
  check (status in ('available', 'borrowed', 'lost', 'damaged', 'withdrawn'));

create or replace function public.request_physical_book(
  p_book_id bigint,
  p_copy_id bigint,
  p_duration_days integer,
  p_payment_method text,
  p_transaction_reference text default null,
  p_payment_proof_path text default null
)
returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  chosen_option public.physical_loan_options;
  created_request public.physical_book_requests;
begin
  if current_user_id is null then raise exception 'Sign in to request a physical book'; end if;
  if p_payment_method not in ('cash', 'gcash') then raise exception 'Choose cash or GCash'; end if;
  if p_duration_days < 1 or p_duration_days > 365 then raise exception 'Choose a valid loan period'; end if;
  if not exists (select 1 from public.books where id = p_book_id and catalog_type in ('physical', 'hybrid')) then
    raise exception 'This title is not in the physical collection';
  end if;
  if p_copy_id is not null and not exists (select 1 from public.physical_book_copies where id = p_copy_id and book_id = p_book_id) then
    raise exception 'The scanned copy does not belong to this book';
  end if;
  if exists (select 1 from public.physical_book_requests where student_id = current_user_id and book_id = p_book_id and status in ('pending', 'checked_out')) then
    raise exception 'You already have an open request or loan for this book';
  end if;
  if exists (select 1 from public.physical_book_requests where student_id = current_user_id and status in ('checked_out', 'lost') and (status = 'lost' or due_date < now())) then
    raise exception 'Resolve your overdue or lost library book before requesting another';
  end if;
  select * into chosen_option from public.physical_loan_options where book_id = p_book_id and duration_days = p_duration_days and is_active;
  if chosen_option.id is null then raise exception 'That loan period is not available for this book'; end if;
  if p_payment_method = 'gcash' then
    if nullif(trim(p_transaction_reference), '') is null or char_length(trim(p_transaction_reference)) > 100
      or nullif(trim(p_payment_proof_path), '') is null or p_payment_proof_path not like current_user_id::text || '/%' then
      raise exception 'Upload payment proof and enter its transaction reference';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'physical-payment-proofs' and name = p_payment_proof_path) then
      raise exception 'Uploaded GCash proof could not be found';
    end if;
  elsif p_transaction_reference is not null or p_payment_proof_path is not null then
    raise exception 'Cash requests must not include online payment proof';
  end if;
  if not exists (select 1 from public.physical_book_copies where book_id = p_book_id and status = 'available') then
    raise exception 'No physical copy is currently available; join the availability queue instead';
  end if;

  insert into public.physical_book_requests (
    student_id, book_id, loan_option_id, copy_id, duration_days, fee_amount, payment_method,
    payment_status, transaction_reference, payment_proof_path, status, reservation_expires_at
  ) values (
    current_user_id, p_book_id, chosen_option.id, null, p_duration_days, chosen_option.fee_amount,
    p_payment_method, case when p_payment_method = 'gcash' then 'pending_verification' else 'unpaid' end,
    nullif(trim(p_transaction_reference), ''), nullif(trim(p_payment_proof_path), ''), 'pending', null
  ) returning * into created_request;

  delete from public.physical_book_waitlist where student_id = current_user_id and book_id = p_book_id;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (current_user_id, 'physical_request_created', 'physical_book_request', created_request.id,
    jsonb_build_object('book_id', p_book_id, 'scanned_copy_id', p_copy_id, 'payment_method', p_payment_method));
  return created_request;
end;
$$;

-- Keep compatibility with older clients without treating an alert as a hold.
create or replace function public.accept_physical_waitlist_offer(
  p_book_id bigint,
  p_duration_days integer,
  p_payment_method text,
  p_transaction_reference text default null,
  p_payment_proof_path text default null
)
returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  created_request public.physical_book_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.physical_book_waitlist where student_id = auth.uid() and book_id = p_book_id) then
    raise exception 'You are not on this book''s availability queue';
  end if;
  select public.request_physical_book(p_book_id, null, p_duration_days, p_payment_method, p_transaction_reference, p_payment_proof_path)
  into created_request;
  return created_request;
end;
$$;

create or replace function public.system_process_physical_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  processed_count integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  for target in
    select id, student_id, book_id, due_date
    from public.physical_book_requests
    where status = 'checked_out' and due_date <= now() + interval '2 days'
    for update skip locked
  loop
    insert into public.physical_reminder_events(loan_id, reminder_type, reminder_date)
    values (target.id,
      case when target.due_date < now() then 'overdue' else 'due_soon' end,
      case when target.due_date < now() then current_date else target.due_date::date - 2 end)
    on conflict do nothing;
    if found then
      insert into public.notifications(user_id, event_type, title, message, reference_id)
      values (target.student_id,
        case when target.due_date < now() then 'physical_overdue_reminder' else 'physical_due_reminder' end,
        case when target.due_date < now() then 'Physical book overdue' else 'Physical book due soon' end,
        case when target.due_date < now() then 'Please return your overdue physical book to the library.'
          else 'Your physical book is due within two days. Please return it to the library on time.' end,
        target.id);
      insert into public.email_queue(event_type, payload)
      values ('physical_loan_reminder', jsonb_build_object(
        'student_id', target.student_id, 'book_id', target.book_id,
        'request_id', target.id, 'due_date', target.due_date,
        'reminder_type', case when target.due_date < now() then 'overdue' else 'due_soon' end));
      processed_count := processed_count + 1;
    end if;
  end loop;
  return processed_count;
end;
$$;

grant execute on function public.request_physical_book(bigint, bigint, integer, text, text, text) to authenticated;
grant execute on function public.accept_physical_waitlist_offer(bigint, integer, text, text, text) to authenticated;