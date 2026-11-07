begin;

create table if not exists public.library_policy_settings (
  id smallint primary key default 1 check (id = 1),
  fine_grace_days integer not null default 2 check (fine_grace_days between 0 and 30),
  late_fee_per_day numeric(8, 2) not null default 5.00 check (late_fee_per_day between 0 and 1000),
  late_fee_cap numeric(10, 2) not null default 500.00 check (late_fee_cap between 0 and 100000),
  lost_after_days integer not null default 30 check (lost_after_days between 1 and 365),
  faculty_lesson_reward_points integer not null default 25 check (faculty_lesson_reward_points between 0 and 100),
  policy_notice text not null default 'Students and faculty can top up points with the librarian: 200 points for PHP 10, 500 for PHP 22, or 1,000 for PHP 40 (maximum 1,000 points per sale). Students earn points through these cash top-ups. Faculty may also earn the configured reward when an administrator approves a lesson submission. Only administrators add books to the catalog. Librarians can invite students and faculty after checking a school ID in person; ID images are not retained.',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(policy_notice) between 1 and 5000)
);

insert into public.library_policy_settings(id)
values (1)
on conflict (id) do nothing;

alter table public.library_policy_settings enable row level security;
drop policy if exists library_policy_settings_read_public on public.library_policy_settings;
create policy library_policy_settings_read_public on public.library_policy_settings
  for select to anon, authenticated using (true);
revoke all on public.library_policy_settings from public, anon, authenticated;
grant select on public.library_policy_settings to anon, authenticated;

alter table public.physical_book_requests
  add column if not exists policy_grace_days integer not null default 2,
  add column if not exists policy_daily_fine numeric(8, 2) not null default 5.00,
  add column if not exists policy_fine_cap numeric(10, 2) not null default 500.00,
  add column if not exists policy_lost_days integer not null default 30;

alter table public.physical_book_requests
  drop constraint if exists physical_book_requests_policy_snapshot_check;
alter table public.physical_book_requests
  add constraint physical_book_requests_policy_snapshot_check
  check (
    policy_grace_days between 0 and 30
    and policy_daily_fine between 0 and 1000
    and policy_fine_cap between 0 and 100000
    and policy_lost_days between 1 and 365
  );

create or replace function public.snapshot_physical_loan_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare policy public.library_policy_settings;
begin
  select * into policy from public.library_policy_settings where id = 1;
  if policy.id is null then
    raise exception 'Library policy settings are not initialized';
  end if;
  new.policy_grace_days := policy.fine_grace_days;
  new.policy_daily_fine := policy.late_fee_per_day;
  new.policy_fine_cap := policy.late_fee_cap;
  new.policy_lost_days := policy.lost_after_days;
  return new;
end;
$$;

drop trigger if exists snapshot_physical_loan_policy on public.physical_book_requests;
create trigger snapshot_physical_loan_policy
before insert on public.physical_book_requests
for each row execute function public.snapshot_physical_loan_policy();
revoke all on function public.snapshot_physical_loan_policy() from public, anon, authenticated;

create or replace function public.admin_update_library_policy(
  p_fine_grace_days integer,
  p_late_fee_per_day numeric,
  p_late_fee_cap numeric,
  p_lost_after_days integer,
  p_faculty_lesson_reward_points integer,
  p_policy_notice text
)
returns public.library_policy_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  old_policy public.library_policy_settings;
  saved_policy public.library_policy_settings;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fine_grace_days is null or p_fine_grace_days not between 0 and 30 then
    raise exception 'Fine grace period must be between 0 and 30 days';
  end if;
  if p_late_fee_per_day is null or p_late_fee_per_day not between 0 and 1000 then
    raise exception 'Daily late fee must be between PHP 0 and PHP 1,000';
  end if;
  if p_late_fee_cap is null or p_late_fee_cap not between 0 and 100000 then
    raise exception 'Fine cap must be between PHP 0 and PHP 100,000';
  end if;
  if p_lost_after_days is null or p_lost_after_days not between 1 and 365 then
    raise exception 'Lost classification must be between 1 and 365 overdue days';
  end if;
  if p_faculty_lesson_reward_points is null or p_faculty_lesson_reward_points not between 0 and 100 then
    raise exception 'Faculty lesson reward must be between 0 and 100 points';
  end if;
  if nullif(trim(coalesce(p_policy_notice, '')), '') is null or char_length(p_policy_notice) > 5000 then
    raise exception 'Enter a policy notice of at most 5,000 characters';
  end if;

  select * into old_policy from public.library_policy_settings where id = 1 for update;
  if old_policy.id is null then raise exception 'Library policy settings are not initialized'; end if;
  update public.library_policy_settings
  set fine_grace_days = p_fine_grace_days,
      late_fee_per_day = round(p_late_fee_per_day, 2),
      late_fee_cap = round(p_late_fee_cap, 2),
      lost_after_days = p_lost_after_days,
      faculty_lesson_reward_points = p_faculty_lesson_reward_points,
      policy_notice = trim(p_policy_notice),
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1
  returning * into saved_policy;

  insert into public.audit_logs(actor_id, action, target_type, details)
  values (
    auth.uid(),
    'library_policy_updated',
    'library_policy',
    jsonb_build_object(
      'fine_grace_days', jsonb_build_object('before', old_policy.fine_grace_days, 'after', saved_policy.fine_grace_days),
      'late_fee_per_day', jsonb_build_object('before', old_policy.late_fee_per_day, 'after', saved_policy.late_fee_per_day),
      'late_fee_cap', jsonb_build_object('before', old_policy.late_fee_cap, 'after', saved_policy.late_fee_cap),
      'lost_after_days', jsonb_build_object('before', old_policy.lost_after_days, 'after', saved_policy.lost_after_days),
      'faculty_lesson_reward_points', jsonb_build_object('before', old_policy.faculty_lesson_reward_points, 'after', saved_policy.faculty_lesson_reward_points),
      'policy_notice_changed', old_policy.policy_notice is distinct from saved_policy.policy_notice
    )
  );
  return saved_policy;
end;
$$;
revoke all on function public.admin_update_library_policy(integer, numeric, numeric, integer, integer, text) from public, anon;
grant execute on function public.admin_update_library_policy(integer, numeric, numeric, integer, integer, text) to authenticated;

create or replace function public.calculate_overdue_fines(daily_rate numeric default 5.00)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loan record;
  local_today date := (now() at time zone 'Asia/Manila')::date;
  due_local_date date;
  end_local_date date;
  fine_through date;
  chargeable_days integer;
  fine_amount numeric(10, 2);
  can_process_all boolean;
begin
  if daily_rate is distinct from 5.00 then
    raise exception 'Daily fine rates are configured by an administrator and snapshotted for each new request.';
  end if;
  can_process_all := public.is_library_staff()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  if auth.uid() is null and not can_process_all then
    raise exception 'Authenticated member or library staff access required';
  end if;

  for loan in
    select id, student_id, copy_id, due_date, returned_at, status,
           policy_grace_days, policy_daily_fine, policy_fine_cap, policy_lost_days
    from public.physical_book_requests
    where due_date is not null
      and status in ('checked_out', 'return_pending', 'returned')
      and (can_process_all or student_id = auth.uid())
    for update
  loop
    due_local_date := (loan.due_date at time zone 'Asia/Manila')::date;
    end_local_date := case
      when loan.status = 'returned' and loan.returned_at is not null
        then (loan.returned_at at time zone 'Asia/Manila')::date
      else local_today
    end;

    fine_through := least(end_local_date, due_local_date + loan.policy_lost_days);
    if end_local_date > due_local_date + loan.policy_grace_days then
      select count(*)::integer into chargeable_days
      from generate_series(due_local_date + loan.policy_grace_days + 1, fine_through, interval '1 day') as overdue_day(day)
      where extract(dow from overdue_day.day) <> 0
        and not exists (
          select 1 from public.library_holidays holiday
          where holiday.holiday_date = overdue_day.day::date
        );
    else
      chargeable_days := 0;
    end if;

    fine_amount := least(loan.policy_fine_cap, chargeable_days * loan.policy_daily_fine);
    if fine_amount > 0 then
      insert into public.fines(
        physical_book_request_id, borrow_request_id, student_id, amount,
        status, created_at, fine_type, fine_reason
      ) values (
        loan.id, null, loan.student_id, fine_amount, 'unpaid', now(),
        'late_fee', 'Automatic overdue charge under the policy saved with this request.'
      )
      on conflict (physical_book_request_id)
        where physical_book_request_id is not null and fine_type = 'late_fee'
      do update set amount = excluded.amount
      where public.fines.status <> 'paid';
    else
      update public.fines
      set status = 'waived',
          waived_at = now(),
          waiver_reason = 'Recalculated under the policy saved with this request; no chargeable overdue days remain.'
      where physical_book_request_id = loan.id
        and fine_type = 'late_fee'
        and status = 'unpaid';
    end if;

    if loan.status in ('checked_out', 'return_pending')
      and local_today >= due_local_date + loan.policy_lost_days then
      update public.physical_book_requests set status = 'lost'
      where id = loan.id and status in ('checked_out', 'return_pending');
      update public.physical_book_copies
      set status = 'lost', checked_out_at = null, due_date = null
      where id = loan.copy_id;
      insert into public.notifications(user_id, event_type, title, message, reference_id)
      values (
        loan.student_id, 'physical_item_classified_lost', 'Physical book classified as lost',
        format('This physical book has been overdue for %s consecutive days. Late-fine accrual has stopped; contact the library to resolve the lost-item record.', loan.policy_lost_days),
        loan.id
      );
    end if;
  end loop;

  delete from public.physical_book_waitlist waitlist
  where (can_process_all or waitlist.student_id = auth.uid())
    and (exists (
      select 1 from public.physical_book_requests request
      where request.student_id = waitlist.student_id
        and (request.status = 'lost' or (request.status in ('checked_out', 'return_pending') and request.due_date < now()))
    ) or (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = waitlist.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) >= 100);
end;
$$;
revoke all on function public.calculate_overdue_fines(numeric) from public, anon;
grant execute on function public.calculate_overdue_fines(numeric) to authenticated, service_role;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_data jsonb;
  new_data jsonb;
  changed_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_id, action, target_type, details)
    values (auth.uid(), 'account_created', 'profile',
      jsonb_build_object('target_user_id', new.id, 'role', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs(actor_id, action, target_type, details)
    values (auth.uid(), 'account_deleted', 'profile',
      jsonb_build_object('target_user_id', old.id, 'role', old.role));
    return old;
  end if;

  old_data := to_jsonb(old);
  new_data := to_jsonb(new);
  select array_agg(field.key order by field.key) into changed_fields
  from jsonb_each(new_data) field
  where field.key = any(array['full_name', 'first_name', 'middle_name', 'last_name', 'role', 'school', 'department', 'course', 'student_year', 'institutional_id', 'faculty_rank_id'])
    and old_data -> field.key is distinct from field.value;
  if coalesce(cardinality(changed_fields), 0) > 0 then
    insert into public.audit_logs(actor_id, action, target_type, details)
    values (
      auth.uid(),
      case when old.role is distinct from new.role then 'member_role_changed' else 'profile_updated' end,
      'profile',
      jsonb_build_object(
        'target_user_id', new.id,
        'changed_fields', changed_fields,
        'role', new.role
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes
after insert or update or delete on public.profiles
for each row execute function public.audit_profile_changes();
revoke all on function public.audit_profile_changes() from public, anon, authenticated;

create or replace function public.audit_book_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_data jsonb;
  new_data jsonb;
  changed_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'book_created', 'book', new.id,
      jsonb_build_object('title', new.title, 'author', new.author, 'catalog_type', new.catalog_type, 'source_type', new.source_type));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs(actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'book_deleted', 'book', old.id,
      jsonb_build_object('title', old.title, 'author', old.author, 'catalog_type', old.catalog_type));
    return old;
  end if;

  old_data := to_jsonb(old);
  new_data := to_jsonb(new);
  select array_agg(field.key order by field.key) into changed_fields
  from jsonb_each(new_data) field
  where field.key = any(array['title', 'author', 'category', 'discipline', 'genre', 'course_code', 'isbn', 'description', 'catalog_type', 'source_type', 'is_archived'])
    and old_data -> field.key is distinct from field.value;
  if coalesce(cardinality(changed_fields), 0) > 0 then
    insert into public.audit_logs(actor_id, action, target_type, target_id, details)
    values (
      auth.uid(),
      case when old.is_archived is distinct from new.is_archived then 'book_archive_status_changed' else 'book_updated' end,
      'book',
      new.id,
      jsonb_build_object('title', new.title, 'author', new.author, 'changed_fields', changed_fields, 'is_archived', new.is_archived)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_book_changes on public.books;
create trigger audit_book_changes
after insert or update or delete on public.books
for each row execute function public.audit_book_changes();
revoke all on function public.audit_book_changes() from public, anon, authenticated;

commit;
