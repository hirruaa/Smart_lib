-- Persist the staff payment decision made during physical checkout.

alter table public.physical_book_requests
  add column if not exists payment_received_amount numeric(10, 2),
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_notes text;

alter table public.physical_book_requests
  drop constraint if exists physical_request_received_amount_check;
alter table public.physical_book_requests
  add constraint physical_request_received_amount_check
  check (payment_received_amount is null or payment_received_amount >= 0);

create or replace function public.admin_confirm_physical_checkout(
  p_request_id bigint,
  p_amount_paid numeric,
  p_payment_notes text default null
)
returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  target_copy_id bigint;
begin
  if not public.is_admin() then raise exception 'Librarian or administrator access required'; end if;
  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Enter a valid amount received'; end if;
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null or target_request.status <> 'pending' then raise exception 'This request is not ready for checkout'; end if;
  if round(p_amount_paid, 2) <> round(target_request.fee_amount, 2) then raise exception 'Amount received must equal the configured loan fee'; end if;
  if target_request.payment_method = 'gcash' and target_request.payment_status <> 'pending_verification' then raise exception 'Online payment is not awaiting librarian verification'; end if;
  if char_length(coalesce(p_payment_notes, '')) > 500 then raise exception 'Payment notes are limited to 500 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));
  select id into target_copy_id from public.physical_book_copies where book_id = target_request.book_id and status = 'available' order by id limit 1 for update skip locked;
  if target_copy_id is null then raise exception 'No physical copy is currently available'; end if;
  update public.physical_book_copies set status = 'borrowed', checked_out_at = now(), due_date = now() + make_interval(days => target_request.duration_days) where id = target_copy_id;
  update public.physical_book_requests
  set copy_id = target_copy_id, status = 'checked_out', payment_status = 'paid', payment_received_amount = round(p_amount_paid, 2), payment_verified_at = now(), payment_verified_by = auth.uid(), payment_notes = nullif(trim(coalesce(p_payment_notes, '')), ''), checked_out_at = now(), due_date = now() + make_interval(days => target_request.duration_days), receipt_number = 'SL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(p_request_id::text, 6, '0')
  where id = p_request_id returning * into target_request;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target_request.student_id, 'physical_checkout', 'Physical book checked out', 'Your payment and checkout were confirmed. Your receipt is ready in your physical library account.', target_request.id);
  return target_request;
end;
$$;

grant execute on function public.admin_confirm_physical_checkout(bigint, numeric, text) to authenticated;
