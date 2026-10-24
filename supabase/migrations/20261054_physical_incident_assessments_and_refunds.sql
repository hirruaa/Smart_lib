begin;

-- Keep incident inspection and charge assessment as separate staff actions.
alter table public.physical_book_requests
  add column if not exists incident_type text,
  add column if not exists incident_status text,
  add column if not exists incident_note text,
  add column if not exists incident_assessed_amount numeric(10, 2),
  add column if not exists incident_assessed_at timestamptz,
  add column if not exists incident_assessed_by uuid references public.profiles(id) on delete set null,
  add column if not exists incident_resolved_at timestamptz,
  add column if not exists incident_resolved_by uuid references public.profiles(id) on delete set null;

alter table public.physical_book_requests drop constraint if exists physical_request_incident_type_check;
alter table public.physical_book_requests add constraint physical_request_incident_type_check
  check (incident_type is null or incident_type in ('lost', 'damage'));
alter table public.physical_book_requests drop constraint if exists physical_request_incident_status_check;
alter table public.physical_book_requests add constraint physical_request_incident_status_check
  check (incident_status is null or incident_status in ('open', 'resolved', 'withdrawn'));
alter table public.physical_book_requests drop constraint if exists physical_request_incident_amount_check;
alter table public.physical_book_requests add constraint physical_request_incident_amount_check
  check (incident_assessed_amount is null or incident_assessed_amount >= 0);

-- Retain paid receipts. Recovery creates a refund-due transaction; staff records
-- the actual cashier refund separately so the receipt is never silently erased.
alter table public.fines add column if not exists refund_due_at timestamptz;
alter table public.fines add column if not exists refunded_at timestamptz;
alter table public.fines add column if not exists refund_reason text;
alter table public.fines drop constraint if exists fines_status_check;
alter table public.fines add constraint fines_status_check
  check (status in ('unpaid', 'paid', 'waived', 'refund_due', 'refunded'));

create index if not exists idx_physical_incident_queue
  on public.physical_book_requests(incident_type, incident_status, incident_assessed_at, created_at desc)
  where incident_type is not null;

-- Backfill cases already represented by physical loan history.
update public.physical_book_requests request
set incident_type = case when request.status = 'lost' then 'lost'
      when history.return_condition = 'damaged' then 'damage' else request.incident_type end,
    incident_status = case when request.status = 'lost' then 'open'
      when history.return_condition = 'damaged' then 'open' else request.incident_status end,
    incident_note = coalesce(request.incident_note, history.notes)
from public.physical_book_loan_history history
where history.request_id = request.id
  and (request.status = 'lost' or history.return_condition = 'damaged')
  and request.incident_type is null;

-- An overdue item automatically classified as lost enters the same case queue.
create or replace function public.sync_physical_lost_incident()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'lost' and new.incident_type is null then
      new.incident_type := 'lost';
      new.incident_status := 'open';
      new.incident_note := coalesce(new.incident_note, 'Automatically classified lost after 30 consecutive days overdue.');
    end if;
  elsif new.status = 'lost' and old.status is distinct from new.status and new.incident_type is null then
    new.incident_type := 'lost';
    new.incident_status := 'open';
    new.incident_note := coalesce(new.incident_note, 'Automatically classified lost after 30 consecutive days overdue.');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_physical_lost_incident on public.physical_book_requests;
create trigger trg_sync_physical_lost_incident
before insert or update of status on public.physical_book_requests
for each row execute function public.sync_physical_lost_incident();
revoke all on function public.sync_physical_lost_incident() from public, anon, authenticated;

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
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'lost') then
    raise exception 'Choose available, damaged, or lost';
  end if;
  if p_assessed_amount is null or p_assessed_amount <> 0 then
    raise exception 'Inspection and financial assessment are separate. Record the assessment from the incident case.';
  end if;
  if p_copy_condition = 'damaged' and nullif(trim(coalesce(p_assessment_reason, '')), '') is null then
    raise exception 'Record an inspection note describing the damage';
  end if;
  if p_copy_condition = 'available' and nullif(trim(coalesce(p_assessment_reason, '')), '') is not null then
    raise exception 'Inspection notes are only recorded for damaged or lost items';
  end if;

  perform public.calculate_overdue_fines();
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status = 'lost' and p_copy_condition <> 'lost' then return target_request; end if;
  if target_request.status not in ('checked_out', 'return_pending') then
    raise exception 'This physical loan is no longer awaiting return inspection';
  end if;

  perform public.admin_close_physical_loan(p_request_id, p_copy_condition);
  select * into saved_request from public.physical_book_requests where id = p_request_id;

  if p_copy_condition in ('lost', 'damaged') then
    update public.physical_book_requests
    set incident_type = p_copy_condition,
        incident_status = 'open',
        incident_note = nullif(trim(coalesce(p_assessment_reason, '')), ''),
        incident_assessed_amount = null,
        incident_assessed_at = null,
        incident_assessed_by = null,
        incident_resolved_at = null,
        incident_resolved_by = null
    where id = p_request_id
    returning * into saved_request;
  else
    update public.physical_book_requests
    set incident_type = null, incident_status = null, incident_note = null
    where id = p_request_id returning * into saved_request;
  end if;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
      case when p_copy_condition = 'available' then 'Return inspection: copy checked and available.'
        when p_copy_condition = 'damaged' then 'Damage inspection: ' || trim(p_assessment_reason)
        else 'Lost item reported; replacement assessment pending.' end),
      updated_at = now()
  where request_id = p_request_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_return_inspected', 'physical_book_request', p_request_id,
    jsonb_build_object('copy_condition', p_copy_condition,
      'incident_note', nullif(trim(coalesce(p_assessment_reason, '')), ''),
      'assessment_deferred', p_copy_condition in ('damaged', 'lost')));
  return saved_request;
end;
$$;
revoke all on function public.admin_inspect_physical_return(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_inspect_physical_return(bigint, text, numeric, text) to authenticated;

create or replace function public.admin_assess_physical_incident(
  p_request_id bigint,
  p_amount numeric,
  p_reason text
) returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare target public.physical_book_requests; fine_kind text; saved public.physical_book_requests;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'Enter an assessed amount from 0 to 100,000'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then
    raise exception 'Record the assessment decision and reason (1 to 500 characters)';
  end if;
  select * into target from public.physical_book_requests where id = p_request_id for update;
  if target.id is null or target.incident_type is null or target.incident_type not in ('lost', 'damage') then raise exception 'Physical incident case not found'; end if;
  if target.incident_assessed_at is not null then raise exception 'This incident has already been assessed'; end if;
  if target.incident_type = 'lost' and target.status <> 'lost' then raise exception 'Lost-item case is no longer open'; end if;
  if target.incident_type = 'damage' and (target.status <> 'returned' or target.incident_status <> 'open') then
    raise exception 'Damaged-return case is no longer open';
  end if;

  fine_kind := case when target.incident_type = 'lost' then 'lost_item' else 'damage' end;
  if p_amount > 0 then
    if exists (select 1 from public.fines where physical_book_request_id = p_request_id and fine_type = fine_kind) then
      raise exception 'An assessment of this type already exists for the physical loan';
    end if;
    insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
    values (p_request_id, null, target.student_id, round(p_amount, 2), 'unpaid', now(), fine_kind, trim(p_reason));
  end if;

  update public.physical_book_requests
  set incident_assessed_amount = round(p_amount, 2), incident_assessed_at = now(),
      incident_assessed_by = auth.uid(), incident_note = concat_ws(E'\n', nullif(incident_note, ''), 'Assessment: ' || trim(p_reason)),
      incident_status = case when incident_type = 'damage' then 'open' else incident_status end
  where id = p_request_id returning * into saved;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''), initcap(fine_kind) || ' assessment: PHP ' || round(p_amount, 2)::text || ' - ' || trim(p_reason)),
      updated_at = now()
  where request_id = p_request_id;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_incident_assessed', 'physical_book_request', p_request_id,
    jsonb_build_object('incident_type', fine_kind, 'amount', round(p_amount, 2), 'reason', trim(p_reason), 'no_charge', p_amount = 0));
  return saved;
end;
$$;
revoke all on function public.admin_assess_physical_incident(bigint, numeric, text) from public, anon;
grant execute on function public.admin_assess_physical_incident(bigint, numeric, text) to authenticated;

-- A damage assessment is financial review; the copy still needs a repair or
-- withdrawal disposition before it can return to circulation.
create or replace function public.admin_resolve_physical_damage_case(
  p_request_id bigint,
  p_copy_condition text,
  p_resolution_note text
) returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare target public.physical_book_requests;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition not in ('available', 'damaged', 'withdrawn') then raise exception 'Choose repaired, still damaged, or withdrawn'; end if;
  if nullif(trim(coalesce(p_resolution_note, '')), '') is null or char_length(trim(p_resolution_note)) > 500 then
    raise exception 'Record the repair or withdrawal decision';
  end if;
  select * into target from public.physical_book_requests
  where id = p_request_id and status = 'returned' and incident_type = 'damage' and incident_status = 'open'
  for update;
  if target.id is null then raise exception 'Open damage case not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target.book_id::text, 0));
  update public.physical_book_copies set status = p_copy_condition
  where id = target.copy_id and status = 'damaged';
  if not found then raise exception 'Copy is no longer awaiting repair'; end if;
  update public.physical_book_requests
  set incident_status = case when p_copy_condition = 'withdrawn' then 'withdrawn' when p_copy_condition = 'damaged' then 'open' else 'resolved' end,
      incident_resolved_at = case when p_copy_condition = 'damaged' then null else now() end, incident_resolved_by = case when p_copy_condition = 'damaged' then null else auth.uid() end,
      incident_note = concat_ws(E'\n', nullif(incident_note, ''), 'Disposition: ' || trim(p_resolution_note))
  where id = p_request_id returning * into target;
  update public.physical_book_loan_history set notes = concat_ws(E'\n', nullif(notes, ''),
    'Damage disposition (' || p_copy_condition || '): ' || trim(p_resolution_note)), updated_at = now()
  where request_id = p_request_id;
  if p_copy_condition = 'available' then perform public.offer_next_physical_waitlist(target.book_id, target.copy_id); end if;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_damage_case_resolved', 'physical_book_request', p_request_id,
    jsonb_build_object('book_id', target.book_id, 'copy_id', target.copy_id, 'copy_condition', p_copy_condition, 'note', trim(p_resolution_note)));
  return target;
end;
$$;
revoke all on function public.admin_resolve_physical_damage_case(bigint, text, text) from public, anon;
grant execute on function public.admin_resolve_physical_damage_case(bigint, text, text) to authenticated;

-- Recovery waives unpaid replacement assessments. Paid assessments become
-- refund_due until cashier staff confirms the refund; original receipts remain.
create or replace function public.admin_resolve_lost_physical_loan(
  p_request_id bigint,
  p_copy_condition text,
  p_damage_amount numeric default 0,
  p_damage_reason text default null
) returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare target public.physical_book_requests; paid_total numeric(10,2) := 0; waived_total numeric(10,2) := 0;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'withdrawn') then raise exception 'Choose a valid found-copy condition'; end if;
  if p_copy_condition = 'damaged' and (p_damage_amount is null or p_damage_amount <> 0 or nullif(trim(coalesce(p_damage_reason, '')), '') is null) then
    raise exception 'Record the damage inspection first, then assess any charge from the incident case';
  elsif p_copy_condition <> 'damaged' and (coalesce(p_damage_amount, 0) <> 0 or nullif(trim(coalesce(p_damage_reason, '')), '') is not null) then
    raise exception 'Damage details are only accepted when the recovered copy is damaged';
  end if;
  select * into target from public.physical_book_requests where id = p_request_id and status = 'lost' for update;
  if target.id is null then raise exception 'Lost physical loan not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target.book_id::text, 0));

  select coalesce(sum(amount), 0) into paid_total from public.fines
  where physical_book_request_id = p_request_id and fine_type = 'lost_item' and status = 'paid';
  update public.fines
  set status = 'waived', waived_at = now(), waiver_reason = 'Lost item recovered and accepted by library staff; replacement assessment waived.'
  where p_copy_condition in ('available', 'damaged') and physical_book_request_id = p_request_id
    and fine_type = 'lost_item' and status = 'unpaid'
  returning amount into waived_total;
  update public.fines
  set status = 'refund_due', refund_due_at = now(), refund_reason = 'Lost item recovered; cashier refund due.'
  where p_copy_condition in ('available', 'damaged') and physical_book_request_id = p_request_id
    and fine_type = 'lost_item' and status = 'paid';

  update public.physical_book_copies set status = p_copy_condition, checked_out_at = null, due_date = null where id = target.copy_id;
  update public.physical_book_requests
  set status = 'returned', returned_at = now(),
      incident_type = case when p_copy_condition = 'damaged' then 'damage' else incident_type end,
      incident_status = case when p_copy_condition = 'withdrawn' then 'withdrawn' when p_copy_condition = 'damaged' then 'open' else 'resolved' end,
      incident_assessed_amount = case when p_copy_condition = 'damaged' then null else incident_assessed_amount end,
      incident_assessed_at = case when p_copy_condition = 'damaged' then null else incident_assessed_at end,
      incident_assessed_by = case when p_copy_condition = 'damaged' then null else incident_assessed_by end,
      incident_resolved_at = case when p_copy_condition = 'damaged' then null else now() end, incident_resolved_by = case when p_copy_condition = 'damaged' then null else auth.uid() end,
      incident_note = concat_ws(E'\n', nullif(incident_note, ''),
        case when p_copy_condition = 'damaged' then 'Recovered; copy inspected and remains damaged: ' || trim(p_damage_reason)
          else 'Recovered; copy disposition: ' || p_copy_condition end)
  where id = p_request_id returning * into target;

  update public.physical_book_loan_history set notes = concat_ws(E'\n', nullif(notes, ''),
    case when p_copy_condition = 'damaged' then 'Recovered lost item; copy remains damaged: ' || trim(p_damage_reason)
      else 'Recovered lost item; copy disposition: ' || p_copy_condition end), updated_at = now()
  where request_id = p_request_id;
  if p_copy_condition = 'available' then perform public.offer_next_physical_waitlist(target.book_id, target.copy_id); end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target.student_id, 'physical_hold_resolved', 'Recovered book record resolved',
    case when p_copy_condition = 'withdrawn' then 'The library closed the lost-item case as unresolved. Any assessed charges remain due.'
      when paid_total > 0 then 'The book was recovered. Any unpaid replacement charge was waived; a refund is due for the replacement amount already paid.'
      else 'The book was recovered and its replacement case resolved. Any unpaid replacement assessment was waived; separate late fees remain.' end,
    target.id);
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_copy_condition = 'withdrawn' then 'physical_lost_loan_closed' else 'physical_lost_loan_recovered' end,
    'physical_book_request', target.id,
    jsonb_build_object('book_id', target.book_id, 'copy_id', target.copy_id, 'copy_condition', p_copy_condition,
      'paid_replacement_amount_refund_due', case when p_copy_condition = 'withdrawn' then 0 else paid_total end,
      'unpaid_replacement_amount_waived', case when p_copy_condition = 'withdrawn' then 0 else waived_total end));
  return target;
end;
$$;
revoke all on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) to authenticated;

create or replace function public.admin_record_physical_fine_refund(p_fine_id bigint, p_reason text)
returns public.fines language plpgsql security definer set search_path = public as $$
declare target public.fines;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then raise exception 'Enter a refund reason'; end if;
  update public.fines set status = 'refunded', refunded_at = now(), refund_reason = trim(p_reason)
  where id = p_fine_id and status = 'refund_due' and fine_type = 'lost_item' and physical_book_request_id is not null
  returning * into target;
  if target.id is null then raise exception 'Replacement refund is no longer due'; end if;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_replacement_refunded', 'fine', target.id,
    jsonb_build_object('request_id', target.physical_book_request_id, 'student_id', target.student_id,
      'amount', target.amount, 'reason', target.refund_reason, 'original_receipt', target.receipt_number));
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target.student_id, 'physical_replacement_refunded', 'Replacement refund recorded',
    'The library recorded your replacement-charge refund. Your original receipt remains in your transaction history.', target.id);
  return target;
end;
$$;
revoke all on function public.admin_record_physical_fine_refund(bigint, text) from public, anon;
grant execute on function public.admin_record_physical_fine_refund(bigint, text) to authenticated;

commit;
