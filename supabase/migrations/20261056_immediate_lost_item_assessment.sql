begin;

-- Record the lost-item assessment atomically with the inspection that opens
-- the incident case. Damage reviews remain a separate assessment workflow.
create or replace function public.admin_inspect_physical_return(
  p_request_id bigint,
  p_copy_condition text,
  p_assessed_amount numeric default 0,
  p_assessment_reason text default null
) returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  saved_request public.physical_book_requests;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'lost') then
    raise exception 'Choose available, damaged, or lost';
  end if;
  if p_copy_condition = 'lost' then
    if p_assessed_amount is null or p_assessed_amount <= 0 or p_assessed_amount > 100000 then
      raise exception 'Enter the staff-assessed lost-item charge greater than 0 and no more than 100,000';
    end if;
    if nullif(trim(coalesce(p_assessment_reason, '')), '') is null or char_length(trim(p_assessment_reason)) > 500 then
      raise exception 'Record the lost-item assessment reason (1 to 500 characters)';
    end if;
  elsif p_copy_condition = 'damaged' then
    if coalesce(p_assessed_amount, 0) <> 0 then
      raise exception 'Damage assessments are recorded separately from return inspection';
    end if;
    if nullif(trim(coalesce(p_assessment_reason, '')), '') is null or char_length(trim(p_assessment_reason)) > 500 then
      raise exception 'Record an inspection note describing the damage';
    end if;
  elsif coalesce(p_assessed_amount, 0) <> 0 or nullif(trim(coalesce(p_assessment_reason, '')), '') is not null then
    raise exception 'Inspection notes and assessments are only recorded for damaged or lost items';
  end if;

  perform public.calculate_overdue_fines();
  select * into target_request
  from public.physical_book_requests
  where id = p_request_id
  for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status = 'lost' and p_copy_condition <> 'lost' then return target_request; end if;
  if p_copy_condition = 'lost' and target_request.incident_assessed_at is not null then
    raise exception 'This lost-item case has already been assessed';
  end if;

  if target_request.status in ('checked_out', 'return_pending') then
    perform public.admin_close_physical_loan(p_request_id, p_copy_condition);
  elsif not (target_request.status = 'lost' and p_copy_condition = 'lost') then
    raise exception 'This physical loan is no longer awaiting return inspection';
  end if;

  select * into saved_request from public.physical_book_requests where id = p_request_id;
  if p_copy_condition = 'lost' then
    if exists (
      select 1 from public.fines
      where physical_book_request_id = p_request_id and fine_type = 'lost_item'
    ) then
      raise exception 'A lost-item assessment already exists for this physical loan';
    end if;
    update public.physical_book_requests
    set incident_type = 'lost',
        incident_status = 'open',
        incident_note = concat_ws(E'\n', nullif(incident_note, ''), trim(p_assessment_reason)),
        incident_assessed_amount = round(p_assessed_amount, 2),
        incident_assessed_at = now(),
        incident_assessed_by = auth.uid(),
        incident_resolved_at = null,
        incident_resolved_by = null
    where id = p_request_id
    returning * into saved_request;
    insert into public.fines(
      physical_book_request_id, borrow_request_id, student_id, amount,
      status, created_at, fine_type, fine_reason
    )
    values (
      p_request_id, null, saved_request.student_id, round(p_assessed_amount, 2),
      'unpaid', now(), 'lost_item', trim(p_assessment_reason)
    );
  elsif p_copy_condition = 'damaged' then
    update public.physical_book_requests
    set incident_type = 'damage',
        incident_status = 'open',
        incident_note = trim(p_assessment_reason),
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
    where id = p_request_id
    returning * into saved_request;
  end if;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
      case when p_copy_condition = 'available' then 'Return inspection: copy checked and available.'
        when p_copy_condition = 'damaged' then 'Damage inspection: ' || trim(p_assessment_reason)
        else 'Lost-item assessment: PHP ' || round(p_assessed_amount, 2)::text || ' - ' || trim(p_assessment_reason) end),
      updated_at = now()
  where request_id = p_request_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_return_inspected', 'physical_book_request', p_request_id,
    jsonb_build_object('copy_condition', p_copy_condition,
      'assessed_amount', case when p_copy_condition = 'lost' then round(p_assessed_amount, 2) else 0 end,
      'assessment_reason', nullif(trim(coalesce(p_assessment_reason, '')), '')));
  return saved_request;
end;
$$;

revoke all on function public.admin_inspect_physical_return(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_inspect_physical_return(bigint, text, numeric, text) to authenticated;

commit;
