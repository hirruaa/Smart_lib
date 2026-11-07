begin;

alter table public.profiles
  add column if not exists institutional_id text,
  add column if not exists student_photo_path text;

alter table public.profiles
  drop constraint if exists profiles_institutional_id_format;
alter table public.profiles
  add constraint profiles_institutional_id_format
  check (institutional_id is null or institutional_id ~ '^[0-9]{4}-[0-9]{5}$');
create unique index if not exists profiles_institutional_id_unique
  on public.profiles (institutional_id)
  where institutional_id is not null;

alter table public.books
  add column if not exists discipline text,
  add column if not exists genre text;
update public.books
set source_type = 'community_contribution'
where source_type is null and lower(trim(category)) = 'community contribution';
update public.books
set discipline = nullif(trim(category), '')
where discipline is null
  and lower(trim(category)) not in ('community contribution', 'entertainment', 'uncategorized');
update public.books
set genre = nullif(trim(category), '')
where genre is null and lower(trim(category)) = 'entertainment';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-headshots', 'student-headshots', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.enforce_library_borrowing_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
  unpaid_total numeric(10, 2);
  overdue_physical boolean;
begin
  member_id := new.student_id;
  if member_id is null then return new; end if;
  if member_id <> auth.uid() and not public.is_admin() then
    raise exception 'Members can only submit borrowing requests for their own account.';
  end if;

  perform public.calculate_overdue_fines();

  select coalesce(sum(amount), 0) into unpaid_total
  from public.fines
  where student_id = member_id and status = 'unpaid' and physical_book_request_id is not null;

  select exists (
    select 1
    from public.physical_book_requests
    where student_id = member_id
      and (
        status = 'lost'
        or (status in ('checked_out', 'return_pending') and due_date < now())
      )
  ) into overdue_physical;

  if tg_table_name = 'borrow_requests' then
    if overdue_physical or unpaid_total > 100 then
      raise exception 'New borrowing is unavailable while an overdue physical item or a balance above ₱100 remains.';
    end if;
  elsif tg_table_name = 'physical_book_waitlist' then
    if overdue_physical then
      raise exception 'Return overdue physical items before joining an availability queue.';
    end if;
    if unpaid_total > 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is ₱100 or less.';
    end if;
  else
    if new.duration_days <> 14 then
      raise exception 'General-circulation physical books have a 14-day loan period.';
    end if;
    if overdue_physical then
      raise exception 'Return overdue physical items before requesting another physical book.';
    end if;
    if unpaid_total > 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is ₱100 or less.';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.admin_waive_physical_fine(bigint, text);
create function public.admin_waive_physical_fine(
  p_fine_id bigint,
  p_reason_category text,
  p_justification text
) returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fine public.fines;
  loan_status text;
  recorded_reason text;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_reason_category is null or p_reason_category not in ('Medical Excuse', 'Administrative Exemption') then
    raise exception 'Choose a supported waiver reason';
  end if;
  if nullif(trim(coalesce(p_justification, '')), '') is null or char_length(trim(p_justification)) > 500 then
    raise exception 'Enter a waiver justification of 1 to 500 characters';
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
  recorded_reason := p_reason_category || ': ' || trim(p_justification);
  update public.fines
  set status = 'waived', waived_at = now(), waiver_reason = recorded_reason
  where id = p_fine_id returning * into target_fine;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_fine_waived', 'fine', target_fine.id,
    jsonb_build_object('physical_book_request_id', target_fine.physical_book_request_id,
      'student_id', target_fine.student_id, 'fine_type', target_fine.fine_type,
      'amount', target_fine.amount, 'reason_category', p_reason_category,
      'justification', trim(p_justification)));
  return target_fine;
end;
$$;
revoke all on function public.admin_waive_physical_fine(bigint, text, text) from public, anon;
grant execute on function public.admin_waive_physical_fine(bigint, text, text) to authenticated;

alter table public.book_contributions
  add column if not exists rejection_reason text;
drop function if exists public.admin_review_book_contribution(bigint, text, integer, integer);
create function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0,
  rejection_reason text default null
) returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  created_book_id bigint;
  owner_path text;
  reason text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid contribution decision'; end if;
  if reward_points < 0 then raise exception 'Reward cannot be negative'; end if;
  if access_points < 0 then raise exception 'Access cost cannot be negative'; end if;
  if decision = 'rejected'
    and (rejection_reason is null or rejection_reason not in ('Poor Scan Quality', 'Copyright Violation', 'Incorrect Metadata')) then
    raise exception 'Choose a supported rejection reason';
  end if;
  reason := case when decision = 'rejected' then rejection_reason else null end;

  select * into contribution from public.book_contributions where id = contribution_id for update;
  if contribution.id is null or contribution.status <> 'pending' then raise exception 'Pending contribution not found'; end if;

  if decision = 'approved' then
    owner_path := 'contributions/' || contribution.user_id::text || '/';
    if contribution.storage_provider = 'google_drive' then
      if nullif(trim(contribution.storage_file_id), '') is null then
        raise exception 'Google Drive contribution is missing its file ID';
      end if;
    elsif contribution.storage_provider is distinct from 'supabase'
      or nullif(trim(contribution.storage_path), '') is null
      or (
        contribution.storage_path not like owner_path || '%'
        and contribution.storage_path not like 'ebooks/' || owner_path || '%'
      )
      or regexp_replace(contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
      or nullif(trim(contribution.pdf_url), '') is distinct from nullif(trim(contribution.storage_path), '') then
      raise exception 'Contribution file must be in the submitter private storage folder before approval';
    end if;

    insert into public.books(
      title, author, category, source_type, description, pdf_url,
      storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type, access_points
    ) values (
      contribution.title, contribution.author, 'Community contribution', 'community_contribution',
      contribution.description, contribution.pdf_url, contribution.storage_provider,
      contribution.storage_file_id, contribution.storage_path, contribution.file_name,
      contribution.file_size, contribution.mime_type, access_points
    ) returning id into created_book_id;
    update public.profiles set points_balance = points_balance + reward_points where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved library contribution');
    end if;
  end if;

  update public.book_contributions
  set status = decision, points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = created_book_id, reviewed_by = auth.uid(), reviewed_at = now(),
      rejection_reason = reason
  where id = contribution.id returning * into contribution;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (contribution.user_id, 'contribution_review',
    case when decision = 'approved' then 'Contribution approved' else 'Contribution reviewed' end,
    case when decision = 'approved' then 'Your resource was added to the library.' else 'Your submitted resource was not approved: ' || reason || '.' end,
    contribution.id);
  return contribution;
end;
$$;
revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer, text) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer, text) to authenticated;

drop function if exists public.admin_confirm_physical_checkout(bigint);
drop function if exists public.admin_confirm_physical_checkout(bigint, numeric, text);
create function public.admin_confirm_physical_checkout(
  p_request_id bigint,
  p_amount_paid numeric,
  p_payment_notes text,
  p_id_card_presented boolean
) returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  target_copy_id bigint;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_id_card_presented is distinct from true then raise exception 'Confirm that the member presented a physical institutional ID card'; end if;
  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Enter a valid amount received'; end if;
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null or target_request.status <> 'pending' then raise exception 'This request is not ready for checkout'; end if;
  if round(p_amount_paid, 2) <> round(target_request.fee_amount, 2) then raise exception 'Amount received must equal the configured loan fee'; end if;
  if target_request.payment_method = 'gcash' and target_request.payment_status <> 'pending_verification' then raise exception 'Online payment is not awaiting librarian verification'; end if;
  if char_length(coalesce(p_payment_notes, '')) > 500 then raise exception 'Payment notes are limited to 500 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));
  select id into target_copy_id from public.physical_book_copies
  where book_id = target_request.book_id and status = 'available'
  order by id limit 1 for update skip locked;
  if target_copy_id is null then raise exception 'No physical copy is currently available'; end if;
  update public.physical_book_copies
  set status = 'borrowed', checked_out_at = now(), due_date = now() + make_interval(days => target_request.duration_days)
  where id = target_copy_id;
  update public.physical_book_requests
  set copy_id = target_copy_id, status = 'checked_out', payment_status = 'paid',
      payment_received_amount = round(p_amount_paid, 2), payment_verified_at = now(),
      payment_verified_by = auth.uid(),
      payment_notes = concat_ws(E'\n', 'Institutional ID card presented and photo visually matched by staff.',
        nullif(trim(coalesce(p_payment_notes, '')), '')),
      checked_out_at = now(), due_date = now() + make_interval(days => target_request.duration_days),
      receipt_number = 'SL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(p_request_id::text, 6, '0')
  where id = p_request_id returning * into target_request;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_id_verified_at_checkout', 'physical_book_request', p_request_id,
    jsonb_build_object('student_id', target_request.student_id, 'id_card_presented', true, 'copy_id', target_copy_id));
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (target_request.student_id, 'physical_checkout', 'Physical book checked out',
    'Your payment and checkout were confirmed. Your receipt is ready in your physical library account.',
    target_request.id);
  return target_request;
end;
$$;
revoke all on function public.admin_confirm_physical_checkout(bigint, numeric, text, boolean) from public, anon;
grant execute on function public.admin_confirm_physical_checkout(bigint, numeric, text, boolean) to authenticated;

drop function if exists public.admin_inspect_physical_return(bigint, text, numeric, text);
create function public.admin_inspect_physical_return(
  p_request_id bigint,
  p_copy_condition text,
  p_assessed_amount numeric,
  p_assessment_reason text,
  p_id_card_presented boolean
) returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  saved_request public.physical_book_requests;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_id_card_presented is distinct from true then raise exception 'Confirm that the member presented a physical institutional ID card'; end if;
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
    if coalesce(p_assessed_amount, 0) <> 0 then raise exception 'Damage assessments are recorded separately from return inspection'; end if;
    if nullif(trim(coalesce(p_assessment_reason, '')), '') is null or char_length(trim(p_assessment_reason)) > 500 then
      raise exception 'Record an inspection note describing the damage';
    end if;
  elsif coalesce(p_assessed_amount, 0) <> 0 or nullif(trim(coalesce(p_assessment_reason, '')), '') is not null then
    raise exception 'Inspection notes and assessments are only recorded for damaged or lost items';
  end if;

  perform public.calculate_overdue_fines();
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
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
    if exists (select 1 from public.fines where physical_book_request_id = p_request_id and fine_type = 'lost_item') then
      raise exception 'A lost-item assessment already exists for this physical loan';
    end if;
    update public.physical_book_requests
    set incident_type = 'lost', incident_status = 'open',
        incident_note = concat_ws(E'\n', nullif(incident_note, ''), trim(p_assessment_reason)),
        incident_assessed_amount = round(p_assessed_amount, 2), incident_assessed_at = now(),
        incident_assessed_by = auth.uid(), incident_resolved_at = null, incident_resolved_by = null
    where id = p_request_id returning * into saved_request;
    insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
    values (p_request_id, null, saved_request.student_id, round(p_assessed_amount, 2), 'unpaid', now(), 'lost_item', trim(p_assessment_reason));
  elsif p_copy_condition = 'damaged' then
    update public.physical_book_requests
    set incident_type = 'damage', incident_status = 'open', incident_note = trim(p_assessment_reason),
        incident_assessed_amount = null, incident_assessed_at = null, incident_assessed_by = null,
        incident_resolved_at = null, incident_resolved_by = null
    where id = p_request_id returning * into saved_request;
  else
    update public.physical_book_requests set incident_type = null, incident_status = null, incident_note = null
    where id = p_request_id returning * into saved_request;
  end if;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
      case when p_copy_condition = 'available' then 'Return inspection: copy checked and available.'
        when p_copy_condition = 'damaged' then 'Damage inspection: ' || trim(p_assessment_reason)
        else 'Lost-item assessment: PHP ' || round(p_assessed_amount, 2)::text || ' - ' || trim(p_assessment_reason) end,
      'Institutional ID card presented and visually matched by staff.'),
      updated_at = now()
  where request_id = p_request_id;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_return_inspected', 'physical_book_request', p_request_id,
    jsonb_build_object('copy_condition', p_copy_condition, 'id_card_presented', true,
      'assessed_amount', case when p_copy_condition = 'lost' then round(p_assessed_amount, 2) else 0 end,
      'assessment_reason', nullif(trim(coalesce(p_assessment_reason, '')), '')));
  return saved_request;
end;
$$;
revoke all on function public.admin_inspect_physical_return(bigint, text, numeric, text, boolean) from public, anon;
grant execute on function public.admin_inspect_physical_return(bigint, text, numeric, text, boolean) to authenticated;

revoke all on function public.admin_create_physical_book(text, text, text, text, text, text, integer, text, text) from public, anon, authenticated;
alter function public.admin_create_physical_book(text, text, text, text, text, text, integer, text, text)
  rename to admin_create_physical_book_internal;
create function public.admin_create_physical_book(
  p_title text, p_author text, p_category text, p_isbn text, p_description text,
  p_cover_image_url text, p_quantity integer, p_code_prefix text, p_location text,
  p_discipline text, p_genre text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare created_book_id bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(coalesce(p_discipline, '')), '') is null
    and nullif(trim(coalesce(p_genre, '')), '') is null then
    raise exception 'Enter a discipline or genre for the physical title';
  end if;
  if char_length(trim(coalesce(p_discipline, ''))) > 120 or char_length(trim(coalesce(p_genre, ''))) > 120 then
    raise exception 'Discipline and genre are limited to 120 characters';
  end if;
  created_book_id := public.admin_create_physical_book_internal(
    p_title, p_author, p_category, p_isbn, p_description, p_cover_image_url,
    p_quantity, p_code_prefix, p_location
  );
  update public.books
  set discipline = nullif(trim(coalesce(p_discipline, '')), ''),
      genre = nullif(trim(coalesce(p_genre, '')), ''),
      category = coalesce(nullif(trim(coalesce(p_discipline, '')), ''), nullif(trim(coalesce(p_genre, '')), ''))
  where id = created_book_id;
  return created_book_id;
end;
$$;
grant execute on function public.admin_create_physical_book(text, text, text, text, text, text, integer, text, text, text, text) to authenticated;

revoke all on function public.admin_update_physical_book(bigint, text, text, text, text, text) from public, anon, authenticated;
alter function public.admin_update_physical_book(bigint, text, text, text, text, text)
  rename to admin_update_physical_book_internal;
create function public.admin_update_physical_book(
  p_book_id bigint, p_title text, p_author text, p_category text,
  p_isbn text, p_description text, p_discipline text, p_genre text
) returns public.books
language plpgsql
security definer
set search_path = public
as $$
declare updated_book public.books;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(coalesce(p_discipline, '')), '') is null
    and nullif(trim(coalesce(p_genre, '')), '') is null then
    raise exception 'Enter a discipline or genre for the physical title';
  end if;
  if char_length(trim(coalesce(p_discipline, ''))) > 120 or char_length(trim(coalesce(p_genre, ''))) > 120 then
    raise exception 'Discipline and genre are limited to 120 characters';
  end if;
  perform public.admin_update_physical_book_internal(
    p_book_id, p_title, p_author, p_category, p_isbn, p_description
  );
  update public.books
  set discipline = nullif(trim(coalesce(p_discipline, '')), ''),
      genre = nullif(trim(coalesce(p_genre, '')), ''),
      category = coalesce(nullif(trim(coalesce(p_discipline, '')), ''), nullif(trim(coalesce(p_genre, '')), ''))
  where id = p_book_id and catalog_type in ('physical', 'hybrid')
  returning * into updated_book;
  if updated_book.id is null then raise exception 'Physical book not found'; end if;
  return updated_book;
end;
$$;
grant execute on function public.admin_update_physical_book(bigint, text, text, text, text, text, text, text) to authenticated;

create function public.admin_update_member_academics(
  target_user_id uuid, new_role text, new_school text, new_department text,
  new_course text, new_student_year text, new_faculty_rank_id bigint,
  new_institutional_id text
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare updated_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_role in ('student', 'faculty') and coalesce(new_institutional_id, '') !~ '^[0-9]{4}-[0-9]{5}$' then
    raise exception 'Enter a 9-digit institutional ID in NNNN-NNNNN format';
  end if;
  if new_role = 'librarian' and nullif(trim(coalesce(new_institutional_id, '')), '') is not null then
    raise exception 'Librarian accounts do not use borrower institutional IDs';
  end if;
  updated_profile := public.admin_update_member_academics(
    target_user_id, new_role, new_school, new_department, new_course,
    new_student_year, new_faculty_rank_id
  );
  update public.profiles
  set institutional_id = case when new_role = 'librarian' then null else trim(new_institutional_id) end
  where id = target_user_id returning * into updated_profile;
  insert into public.audit_logs(actor_id, action, target_type, details)
  values (auth.uid(), 'member_institutional_id_updated', 'profile',
    jsonb_build_object('target_user_id', target_user_id, 'institutional_id', updated_profile.institutional_id));
  return updated_profile;
end;
$$;
revoke all on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint, text) to authenticated;

commit;
