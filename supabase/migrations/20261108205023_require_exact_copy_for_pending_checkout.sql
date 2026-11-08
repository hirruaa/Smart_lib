-- Require an explicitly selected copy for pending-request checkout.
begin;

drop function if exists public.admin_confirm_physical_checkout(bigint, numeric, text, boolean);

create function public.admin_confirm_physical_checkout(
  p_request_id bigint,
  p_copy_code text,
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
  target_request public.physical_book_requests;
  target_copy public.physical_book_copies;
  checked_out_at_time timestamptz := now();
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

  select * into target_request
  from public.physical_book_requests
  where id = p_request_id
  for update;
  if target_request.id is null or target_request.status <> 'pending' then
    raise exception 'This request is not ready for checkout';
  end if;
  if target_request.payment_method is distinct from 'cash' then
    raise exception 'This historical online-payment request cannot be checked out; reject it and ask the member to submit a cash request';
  end if;
  if round(p_amount_paid, 2) <> round(target_request.fee_amount, 2) then
    raise exception 'Amount received must equal the configured loan fee';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));

  select * into target_copy
  from public.physical_book_copies
  where copy_code = trim(p_copy_code);
  if target_copy.id is null then raise exception 'No physical copy matches that accession tag'; end if;
  if target_copy.book_id <> target_request.book_id then
    raise exception 'The selected copy does not belong to this requested title';
  end if;

  select * into target_copy
  from public.physical_book_copies
  where id = target_copy.id and status = 'available'
  for update skip locked;
  if target_copy.id is null then
    raise exception 'The selected copy is no longer available; choose another available copy';
  end if;

  update public.physical_book_copies
  set status = 'borrowed',
      checked_out_at = checked_out_at_time,
      due_date = checked_out_at_time + make_interval(days => target_request.duration_days)
  where id = target_copy.id;

  update public.physical_book_requests
  set copy_id = target_copy.id,
      status = 'checked_out',
      payment_status = 'paid',
      payment_received_amount = round(p_amount_paid, 2),
      payment_verified_at = checked_out_at_time,
      payment_verified_by = auth.uid(),
      payment_notes = nullif(trim(coalesce(p_payment_notes, '')), ''),
      checked_out_at = checked_out_at_time,
      due_date = checked_out_at_time + make_interval(days => target_request.duration_days),
      receipt_number = 'SL-' || to_char(checked_out_at_time, 'YYYYMMDD') || '-' || lpad(p_request_id::text, 6, '0')
  where id = p_request_id
  returning * into target_request;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_id_verified_at_checkout', 'physical_book_request', target_request.id,
    jsonb_build_object(
      'student_id', target_request.student_id,
      'id_card_presented', true,
      'copy_id', target_copy.id,
      'copy_code', target_copy.copy_code
    ));

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target_request.student_id, 'physical_checkout', 'Physical book checked out',
    'Your payment and checkout were confirmed. Your receipt is ready in your physical library account.',
    target_request.id);
  return target_request;
end;
$$;

revoke all on function public.admin_confirm_physical_checkout(bigint, text, numeric, text, boolean)
  from public, anon;
grant execute on function public.admin_confirm_physical_checkout(bigint, text, numeric, text, boolean)
  to authenticated;

do $$
begin
  if to_regprocedure('public.admin_confirm_physical_checkout_internal(bigint,numeric,text)') is not null then
    execute 'revoke all on function public.admin_confirm_physical_checkout_internal(bigint, numeric, text) from public, anon, authenticated';
  end if;
end;
$$;

commit;
