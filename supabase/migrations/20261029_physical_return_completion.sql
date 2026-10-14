-- Ensure a completed physical return releases the assigned copy.
-- A member's return request remains return_pending until staff inspects the copy.

alter table public.physical_book_requests
  drop constraint if exists physical_book_requests_status_check;

alter table public.physical_book_requests
  add constraint physical_book_requests_status_check
  check (status in ('pending', 'checked_out', 'return_pending', 'returned', 'rejected', 'cancelled', 'expired', 'lost'));

create or replace function public.admin_close_physical_loan(
  p_request_id bigint,
  p_copy_condition text default 'available'
)
returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  updated_copy public.physical_book_copies;
begin
  if not public.is_admin() then
    raise exception 'Librarian or administrator access required';
  end if;

  if p_copy_condition not in ('available', 'damaged', 'lost') then
    raise exception 'Choose available, damaged, or lost';
  end if;

  select * into target_request
  from public.physical_book_requests
  where id = p_request_id
  for update;

  if target_request.id is null
    or target_request.status not in ('checked_out', 'return_pending') then
    raise exception 'This book is not currently checked out or awaiting return';
  end if;

  if target_request.copy_id is null then
    raise exception 'This loan has no assigned physical copy';
  end if;

  -- Serialize return and checkout operations for the same title. This prevents
  -- a newly released copy from being allocated inconsistently under concurrency.
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));

  update public.physical_book_copies
  set status = p_copy_condition,
      checked_out_at = null,
      due_date = null
  where id = target_request.copy_id
  returning * into updated_copy;

  if updated_copy.id is null then
    raise exception 'The assigned physical copy no longer exists';
  end if;

  update public.physical_book_requests
  set status = case when p_copy_condition = 'lost' then 'lost' else 'returned' end,
      returned_at = now()
  where id = p_request_id
  returning * into target_request;

  if p_copy_condition = 'available' then
    perform public.offer_next_physical_waitlist(target_request.book_id, target_request.copy_id);
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (
    target_request.student_id,
    'physical_return_completed',
    'Physical return completed',
    'The library has completed your physical-book return.',
    target_request.id
  );

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'physical_loan_closed',
    'physical_book_request',
    target_request.id,
    jsonb_build_object(
      'book_id', target_request.book_id,
      'copy_id', target_request.copy_id,
      'copy_condition', p_copy_condition
    )
  );

  return target_request;
end;
$$;

grant execute on function public.admin_close_physical_loan(bigint, text) to authenticated;
