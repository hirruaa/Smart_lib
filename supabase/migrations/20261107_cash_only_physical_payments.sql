begin;

create or replace function public.enforce_physical_cash_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.payment_method is distinct from 'cash'
      or new.transaction_reference is not null
      or new.payment_proof_path is not null then
      raise exception 'Physical book requests accept cash at the library desk only';
    end if;
  elsif old.payment_method is distinct from 'cash' then
    if new.payment_method is distinct from old.payment_method
      or new.transaction_reference is distinct from old.transaction_reference
      or new.payment_proof_path is distinct from old.payment_proof_path then
      raise exception 'Historical online-payment details are read-only';
    end if;
  elsif new.payment_method is distinct from 'cash'
    or new.transaction_reference is not null
    or new.payment_proof_path is not null then
    raise exception 'Physical book requests accept cash at the library desk only';
  end if;

  return new;
end;
$$;

drop trigger if exists physical_requests_cash_only on public.physical_book_requests;
create trigger physical_requests_cash_only
before insert or update on public.physical_book_requests
for each row execute function public.enforce_physical_cash_only();

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
  if p_payment_method is distinct from 'cash'
    or p_transaction_reference is not null
    or p_payment_proof_path is not null then
    raise exception 'Physical book requests accept cash at the library desk only';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'physical-request:' || current_user_id::text || ':' || p_book_id::text, 0
  ));
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

  select * into chosen_option
  from public.physical_loan_options
  where book_id = p_book_id and duration_days = p_duration_days and is_active;
  if chosen_option.id is null then raise exception 'That loan period is not available for this book'; end if;
  if not exists (select 1 from public.physical_book_copies where book_id = p_book_id and status = 'available') then
    raise exception 'No physical copy is currently available; join the availability queue instead';
  end if;

  insert into public.physical_book_requests (
    student_id, book_id, loan_option_id, copy_id, duration_days, fee_amount, payment_method,
    payment_status, transaction_reference, payment_proof_path, status, reservation_expires_at
  ) values (
    current_user_id, p_book_id, chosen_option.id, null, p_duration_days, chosen_option.fee_amount,
    'cash', 'unpaid', null, null, 'pending', null
  ) returning * into created_request;
  delete from public.physical_book_waitlist where student_id = current_user_id and book_id = p_book_id;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (current_user_id, 'physical_request_created', 'physical_book_request', created_request.id,
    jsonb_build_object('book_id', p_book_id, 'scanned_copy_id', p_copy_id, 'payment_method', 'cash'));
  return created_request;
end;
$$;

revoke all on function public.request_physical_book(bigint, bigint, integer, text, text, text)
  from public, anon;
grant execute on function public.request_physical_book(bigint, bigint, integer, text, text, text)
  to authenticated;

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
  if not exists (
    select 1 from public.physical_book_waitlist
    where student_id = auth.uid() and book_id = p_book_id
  ) then
    raise exception 'You are not on this book''s availability queue';
  end if;

  select public.request_physical_book(
    p_book_id, null, p_duration_days, p_payment_method,
    p_transaction_reference, p_payment_proof_path
  ) into created_request;
  return created_request;
end;
$$;

revoke all on function public.accept_physical_waitlist_offer(bigint, integer, text, text, text)
  from public, anon;
grant execute on function public.accept_physical_waitlist_offer(bigint, integer, text, text, text)
  to authenticated;

create or replace function public.admin_confirm_physical_checkout(
  p_request_id bigint,
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
  saved_request public.physical_book_requests;
begin
  if not public.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_id_card_presented is distinct from true then
    raise exception 'Confirm that the member presented a physical institutional ID card';
  end if;

  select * into saved_request
  from public.physical_book_requests
  where id = p_request_id;
  if saved_request.id is null then raise exception 'Physical-book request not found'; end if;
  if saved_request.payment_method is distinct from 'cash' then
    raise exception 'This historical online-payment request cannot be checked out; reject it and ask the member to submit a cash request';
  end if;

  saved_request := public.admin_confirm_physical_checkout_internal(
    p_request_id, p_amount_paid, p_payment_notes
  );
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_id_verified_at_checkout', 'physical_book_request', saved_request.id,
    jsonb_build_object('student_id', saved_request.student_id, 'id_card_presented', true, 'copy_id', saved_request.copy_id));
  return saved_request;
end;
$$;

revoke all on function public.admin_confirm_physical_checkout(bigint, numeric, text, boolean)
  from public, anon;
grant execute on function public.admin_confirm_physical_checkout(bigint, numeric, text, boolean)
  to authenticated;

drop policy if exists physical_payment_proofs_upload_own on storage.objects;
drop policy if exists physical_payment_proofs_read_own_or_admin on storage.objects;
drop policy if exists physical_payment_proofs_delete_unlinked_own on storage.objects;

commit;
