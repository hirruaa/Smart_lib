-- Physical catalog workflow: searchable inventory, location metadata, and
-- checkout-time copy assignment. Student requests no longer reserve copies.

alter table public.physical_book_copies
  add column if not exists section text,
  add column if not exists shelf_number text,
  add column if not exists row_number text,
  add column if not exists position_number text;

alter table public.physical_book_copies
  drop constraint if exists physical_book_copies_location_length_check;
alter table public.physical_book_copies
  add constraint physical_book_copies_location_length_check check (
    char_length(coalesce(section, '')) <= 120
    and char_length(coalesce(shelf_number, '')) <= 40
    and char_length(coalesce(row_number, '')) <= 40
    and char_length(coalesce(position_number, '')) <= 40
  );

create index if not exists idx_physical_copies_location
  on public.physical_book_copies(book_id, section, shelf_number, row_number, position_number);

create or replace function public.admin_update_physical_book(
  p_book_id bigint,
  p_title text,
  p_author text,
  p_category text,
  p_isbn text default null,
  p_description text default null
)
returns public.books
language plpgsql security definer set search_path = public
as $$
declare
  updated_book public.books;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) > 300 then raise exception 'Enter a title up to 300 characters'; end if;
  if nullif(trim(p_author), '') is null or char_length(trim(p_author)) > 200 then raise exception 'Enter an author up to 200 characters'; end if;
  if nullif(trim(p_category), '') is null or char_length(trim(p_category)) > 120 then raise exception 'Enter a category up to 120 characters'; end if;
  update public.books
  set title = trim(p_title), author = trim(p_author), category = trim(p_category),
      isbn = nullif(trim(coalesce(p_isbn, '')), ''), description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_book_id and catalog_type in ('physical', 'hybrid')
  returning * into updated_book;
  if updated_book.id is null then raise exception 'Physical book not found'; end if;
  return updated_book;
end;
$$;

-- Return handoff workflow: a member may notify the library before arriving at
-- the desk; only staff can inspect the copy and complete the return.
alter table public.physical_book_requests
  drop constraint if exists physical_book_requests_status_check;
alter table public.physical_book_requests
  add constraint physical_book_requests_status_check
  check (status in ('pending', 'checked_out', 'return_pending', 'returned', 'rejected', 'cancelled', 'expired', 'lost'));

create or replace function public.request_physical_return(p_request_id bigint)
returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare
  target_request public.physical_book_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_request
  from public.physical_book_requests
  where id = p_request_id and student_id = auth.uid()
  for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status <> 'checked_out' then raise exception 'This physical loan cannot request a return'; end if;

  update public.physical_book_requests
  set status = 'return_pending'
  where id = p_request_id
  returning * into target_request;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id, 'physical_return_requested', 'Physical return requested',
    'A borrower has requested to return a physical book at the library desk.', target_request.id
  from public.profiles p
  where p.role in ('admin', 'librarian');
  return target_request;
end;
$$;

grant execute on function public.request_physical_return(bigint) to authenticated;

create or replace function public.admin_close_physical_loan(p_request_id bigint, p_copy_condition text default 'available')
returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare
  target_request public.physical_book_requests;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_copy_condition not in ('available', 'damaged', 'lost') then raise exception 'Choose available, damaged, or lost'; end if;
  select * into target_request from public.physical_book_requests
  where id = p_request_id for update;
  if target_request.id is null or target_request.status not in ('checked_out', 'return_pending') then raise exception 'This book is not currently checked out or awaiting return'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));
  update public.physical_book_copies
  set status = p_copy_condition, checked_out_at = null, due_date = null
  where id = target_request.copy_id;
  update public.physical_book_requests
  set status = case when p_copy_condition = 'lost' then 'lost' else 'returned' end, returned_at = now()
  where id = p_request_id returning * into target_request;
  if p_copy_condition = 'available' then perform public.offer_next_physical_waitlist(target_request.book_id, target_request.copy_id); end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target_request.student_id, 'physical_return_completed', 'Physical return completed', 'The library has completed your physical-book return.', target_request.id);
  return target_request;
end;
$$;

grant execute on function public.admin_close_physical_loan(bigint, text) to authenticated;

create or replace function public.admin_update_physical_copy_location(
  p_copy_id bigint,
  p_section text default null,
  p_shelf_number text default null,
  p_row_number text default null,
  p_position_number text default null
)
returns public.physical_book_copies
language plpgsql security definer set search_path = public
as $$
declare
  updated_copy public.physical_book_copies;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_section, ''))) > 120
    or char_length(trim(coalesce(p_shelf_number, ''))) > 40
    or char_length(trim(coalesce(p_row_number, ''))) > 40
    or char_length(trim(coalesce(p_position_number, ''))) > 40 then
    raise exception 'Location details exceed the allowed length';
  end if;
  update public.physical_book_copies
  set section = nullif(trim(coalesce(p_section, '')), ''),
      shelf_number = nullif(trim(coalesce(p_shelf_number, '')), ''),
      row_number = nullif(trim(coalesce(p_row_number, '')), ''),
      position_number = nullif(trim(coalesce(p_position_number, '')), '')
  where id = p_copy_id
  returning * into updated_copy;
  if updated_copy.id is null then raise exception 'Physical copy not found'; end if;
  return updated_copy;
end;
$$;

-- Student requests are pending circulation requests only. A copy is selected
-- and marked borrowed atomically by the librarian at checkout time.
drop function if exists public.request_physical_book(bigint, bigint, integer, text, text, text);
create function public.request_physical_book(
  p_book_id bigint,
  p_copy_id bigint,
  p_duration_days integer,
  p_payment_method text,
  p_transaction_reference text default null,
  p_payment_proof_path text default null
)
returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  book_catalog_type text;
  chosen_option public.physical_loan_options;
  created_request public.physical_book_requests;
begin
  if current_user_id is null then raise exception 'Sign in to request a physical book'; end if;
  if p_payment_method not in ('cash', 'gcash') then raise exception 'Choose cash or GCash'; end if;
  if p_duration_days < 1 or p_duration_days > 365 then raise exception 'Choose a valid loan period'; end if;
  select catalog_type into book_catalog_type from public.books where id = p_book_id;
  if book_catalog_type not in ('physical', 'hybrid') then raise exception 'This title is not in the physical collection'; end if;
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
  insert into public.physical_book_requests (
    student_id, book_id, loan_option_id, copy_id, duration_days, fee_amount, payment_method,
    payment_status, transaction_reference, payment_proof_path, status, reservation_expires_at
  ) values (
    current_user_id, p_book_id, chosen_option.id, null, p_duration_days, chosen_option.fee_amount, p_payment_method,
    case when p_payment_method = 'gcash' then 'pending_verification' else 'unpaid' end,
    nullif(trim(p_transaction_reference), ''), nullif(trim(p_payment_proof_path), ''), 'pending', null
  ) returning * into created_request;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (current_user_id, 'physical_request_created', 'physical_book_request', created_request.id,
    jsonb_build_object('book_id', p_book_id, 'scanned_copy_id', p_copy_id, 'payment_method', p_payment_method));
  return created_request;
end;
$$;

create or replace function public.accept_physical_waitlist_offer(
  p_book_id bigint,
  p_duration_days integer,
  p_payment_method text,
  p_transaction_reference text default null,
  p_payment_proof_path text default null
)
returns public.physical_book_requests
language plpgsql security definer set search_path = public
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
  delete from public.physical_book_waitlist where student_id = auth.uid() and book_id = p_book_id;
  return created_request;
end;
$$;

-- Existing installations may contain pre-change reservations. Release those
-- pending holds before switching to the checkout-time assignment model.
update public.physical_book_copies c
set status = 'available', checked_out_at = null, due_date = null
where c.status = 'reserved'
  and exists (select 1 from public.physical_book_requests r where r.copy_id = c.id and r.status = 'pending');
update public.physical_book_requests
set copy_id = null, reservation_expires_at = null
where status = 'pending';
update public.physical_book_waitlist
set offered_copy_id = null, offer_expires_at = null
where offered_copy_id is not null;

-- A waitlist is now a notification queue, not a copy reservation.
create or replace function public.offer_next_physical_waitlist(
  p_book_id bigint,
  p_copy_id bigint default null
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  next_member record;
begin
  for next_member in
    select student_id from public.physical_book_waitlist
    where book_id = p_book_id and offered_copy_id is null
    order by created_at, student_id
    limit 1
  loop
    insert into public.notifications(user_id, event_type, title, message, reference_id)
    values (next_member.student_id, 'physical_book_available', 'A physical book is available',
      'A copy is available. Submit your request, then visit the library desk for payment and checkout confirmation.', p_book_id);
    return null;
  end loop;
  return null;
end;
$$;

create or replace function public.admin_confirm_physical_checkout(p_request_id bigint)
returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  target_copy_id bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book-request:' || p_request_id::text, 0));
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null or target_request.status <> 'pending' then raise exception 'This request is not ready for checkout'; end if;
  if target_request.payment_method = 'gcash' and target_request.payment_status <> 'pending_verification' then raise exception 'Online payment is not awaiting verification'; end if;
  select id into target_copy_id from public.physical_book_copies
  where book_id = target_request.book_id and status = 'available'
  order by id limit 1 for update skip locked;
  if target_copy_id is null then raise exception 'No physical copy is currently available; keep the request pending or notify the borrower'; end if;
  update public.physical_book_copies set status = 'borrowed', checked_out_at = now(), due_date = now() + make_interval(days => target_request.duration_days)
  where id = target_copy_id;
  update public.physical_book_requests
  set copy_id = target_copy_id, status = 'checked_out', payment_status = 'paid', checked_out_at = now(), reservation_expires_at = null,
      due_date = now() + make_interval(days => target_request.duration_days), receipt_number = 'SL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(p_request_id::text, 6, '0')
  where id = p_request_id returning * into target_request;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target_request.student_id, 'physical_checkout', 'Physical book checked out', 'Your payment and checkout were confirmed. Your digital receipt is ready in your physical library account.', target_request.id);
  return target_request;
end;
$$;

drop function if exists public.get_public_physical_catalog();
create function public.get_public_physical_catalog()
returns table (
  id bigint, title text, author text, category text, description text, isbn text, cover_image_url text,
  catalog_type text, registered_copies bigint, available_copies bigint, borrowed_copies bigint,
  next_due_date timestamptz, locations text[]
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.title, b.author, b.category, b.description, b.isbn, b.cover_image_url, b.catalog_type,
    count(c.id), count(c.id) filter (where c.status = 'available'), count(c.id) filter (where c.status = 'borrowed'),
    min(c.due_date) filter (where c.status = 'borrowed' and c.due_date is not null),
    array_remove(array_agg(distinct nullif(concat_ws(' · ', c.section, case when c.shelf_number is not null then 'Shelf ' || c.shelf_number end, case when c.row_number is not null then 'Row ' || c.row_number end, case when c.position_number is not null then 'Position ' || c.position_number end, c.location), '')), null)
  from public.books b left join public.physical_book_copies c on c.book_id = b.id
  where b.catalog_type in ('physical', 'hybrid')
  group by b.id order by b.title;
$$;

grant execute on function public.admin_update_physical_copy_location(bigint, text, text, text, text) to authenticated;
grant execute on function public.admin_update_physical_book(bigint, text, text, text, text, text) to authenticated;
grant execute on function public.request_physical_book(bigint, bigint, integer, text, text, text) to authenticated;
grant execute on function public.accept_physical_waitlist_offer(bigint, integer, text, text, text) to authenticated;
grant execute on function public.admin_confirm_physical_checkout(bigint) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.physical_book_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.physical_book_copies;
  exception when duplicate_object then null;
  end;
end;
$$;
