-- GENERATED CONSOLIDATION of supabase/migrations/*.sql.
-- Source migration files are canonical; preserve their order and transaction boundaries.
-- This bundle is not a fresh-install schema or a complete migration history.

-- >>> BEGIN MIGRATION: 20261012_harden_contribution_files.sql
-- Apply to an existing Smart Lib database after taking a verified backup
-- and testing this migration against staging. This does not modify table data.
begin;

create or replace function public.submit_book_contribution_v2(
  p_title text,
  p_author text,
  p_description text default null,
  p_pdf_url text default null,
  p_storage_provider text default 'supabase',
  p_storage_file_id text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_file_size bigint default null,
  p_mime_type text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted public.book_contributions;
  owner_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  owner_path := 'contributions/' || auth.uid()::text || '/';

  if nullif(trim(p_title), '') is null or nullif(trim(p_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  if p_storage_provider is distinct from 'supabase' then
    raise exception 'Contributions must use private Supabase storage';
  end if;
  if nullif(trim(p_storage_path), '') is null
    or p_storage_file_id is not null
    or (
      p_storage_path not like owner_path || '%'
      and p_storage_path not like 'ebooks/' || owner_path || '%'
    )
    or regexp_replace(p_storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(p_pdf_url), '') is distinct from nullif(trim(p_storage_path), '') then
    raise exception 'Contribution files must use the submitter private storage folder';
  end if;
  if p_file_size is not null and (p_file_size < 0 or p_file_size > 52428800) then
    raise exception 'PDF files must be 50 MB or smaller';
  end if;

  insert into public.book_contributions(
    user_id, title, author, description, pdf_url,
    storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type
  ) values (
    auth.uid(), trim(p_title), trim(p_author), nullif(trim(p_description), ''), nullif(trim(p_pdf_url), ''),
    p_storage_provider, nullif(trim(p_storage_file_id), ''), nullif(trim(p_storage_path), ''),
    nullif(trim(p_file_name), ''), p_file_size, nullif(trim(p_mime_type), '')
  ) returning * into submitted;
  return submitted;
end;
$$;

create or replace function public.student_resubmit_contribution_v2(
  contribution_id bigint,
  contribution_title text,
  contribution_author text,
  contribution_description text default null,
  contribution_pdf_url text default null,
  contribution_storage_provider text default null,
  contribution_storage_file_id text default null,
  contribution_storage_path text default null,
  contribution_file_name text default null,
  contribution_file_size bigint default null,
  contribution_mime_type text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_contribution public.book_contributions;
  owner_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  owner_path := 'contributions/' || auth.uid()::text || '/';

  if nullif(trim(contribution_title), '') is null or nullif(trim(contribution_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  if contribution_storage_provider is not null and contribution_storage_provider is distinct from 'supabase' then
    raise exception 'Contributions must use private Supabase storage';
  end if;
  if contribution_storage_path is not null and (
    nullif(trim(contribution_storage_path), '') is null
    or contribution_storage_path not like owner_path || '%'
      and contribution_storage_path not like 'ebooks/' || owner_path || '%'
    or regexp_replace(contribution_storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(contribution_pdf_url), '') is distinct from nullif(trim(contribution_storage_path), '')
  ) then
    raise exception 'Contribution files must use the submitter private storage folder';
  end if;
  if contribution_storage_file_id is not null then
    raise exception 'Contribution files must use the submitter private storage folder';
  end if;
  if contribution_file_size is not null and (contribution_file_size < 0 or contribution_file_size > 52428800) then
    raise exception 'PDF files must be 50 MB or smaller';
  end if;

  update public.book_contributions
  set title = trim(contribution_title),
      author = trim(contribution_author),
      description = nullif(trim(contribution_description), ''),
      pdf_url = coalesce(nullif(trim(contribution_pdf_url), ''), pdf_url),
      storage_provider = coalesce(contribution_storage_provider,
        case when contribution_storage_path is not null then 'supabase' else storage_provider end),
      storage_file_id = coalesce(nullif(trim(contribution_storage_file_id), ''), storage_file_id),
      storage_path = coalesce(nullif(trim(contribution_storage_path), ''), storage_path),
      file_name = coalesce(nullif(trim(contribution_file_name), ''), file_name),
      file_size = coalesce(contribution_file_size, file_size),
      mime_type = coalesce(nullif(trim(contribution_mime_type), ''), mime_type),
      status = 'pending',
      review_feedback = null,
      reviewed_by = null,
      reviewed_at = null
  where id = contribution_id and user_id = auth.uid() and status = 'revision_requested'
  returning * into updated_contribution;

  if updated_contribution.id is null then
    raise exception 'Contribution is not available for revision';
  end if;
  if updated_contribution.storage_provider = 'google_drive' then
    if nullif(trim(updated_contribution.storage_file_id), '') is null then
      raise exception 'Google Drive contribution is missing its file ID';
    end if;
  elsif updated_contribution.storage_provider is distinct from 'supabase'
    or nullif(trim(updated_contribution.storage_path), '') is null
    or (
      updated_contribution.storage_path not like owner_path || '%'
      and updated_contribution.storage_path not like 'ebooks/' || owner_path || '%'
    )
    or regexp_replace(updated_contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(updated_contribution.pdf_url), '') is distinct from nullif(trim(updated_contribution.storage_path), '') then
    raise exception 'Contribution file must be in the submitter private storage folder before resubmission';
  end if;
  return updated_contribution;
end;
$$;

create or replace function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  created_book_id bigint;
  owner_path text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid contribution decision'; end if;
  if reward_points < 0 or reward_points > 100 then raise exception 'Reward must be between 0 and 100 points'; end if;
  if access_points < 0 then raise exception 'Access cost cannot be negative'; end if;

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
      title, author, category, description, pdf_url,
      storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type, access_points
    ) values (
      contribution.title, contribution.author, 'Community contribution', contribution.description, contribution.pdf_url,
      contribution.storage_provider, contribution.storage_file_id, contribution.storage_path,
      contribution.file_name, contribution.file_size, contribution.mime_type, access_points
    ) returning id into created_book_id;
    update public.profiles set points_balance = points_balance + reward_points where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved library contribution');
    end if;
  end if;

  update public.book_contributions
  set status = decision, points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = created_book_id, reviewed_by = auth.uid(), reviewed_at = now()
  where id = contribution.id returning * into contribution;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (contribution.user_id, 'contribution_review',
    case when decision = 'approved' then 'Contribution approved' else 'Contribution reviewed' end,
    case when decision = 'approved' then 'Your resource was added to the library.' else 'Your submitted resource was not approved.' end,
    contribution.id);
  return contribution;
end;
$$;

revoke all on function public.submit_book_contribution_v2(text, text, text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.submit_book_contribution_v2(text, text, text, text, text, text, text, text, bigint, text) to authenticated;
revoke all on function public.student_resubmit_contribution_v2(bigint, text, text, text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.student_resubmit_contribution_v2(bigint, text, text, text, text, text, text, text, text, bigint, text) to authenticated;
revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer) to authenticated;

drop policy if exists "Owners read legacy contribution PDFs" on storage.objects;
create policy "Owners read legacy contribution PDFs" on storage.objects
for select to authenticated
using (
  bucket_id = 'ebooks'
  and name like 'ebooks/contributions/' || auth.uid()::text || '/%'
);

commit;
-- <<< END MIGRATION: 20261012_harden_contribution_files.sql

-- >>> BEGIN MIGRATION: 20261012000001_harden_digital_access.sql
-- Apply to an existing Smart Lib database after testing against an isolated
-- Supabase database. This replaces the stale RPC that otherwise overrides
-- free/points mode checks and immediate approval in COMPLETE_SCHEMA.sql.
begin;

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days < 1 or p_duration_days > 90 then
    raise exception 'Choose a lending period between 1 and 90 days';
  end if;

  select access_points, access_mode, catalog_type
  into book_points, book_mode, book_catalog_type
  from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  if book_mode = 'restricted' then raise exception 'Administrator access required'; end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' then ceil(p_duration_days / 7.0)::integer * book_points
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points
  from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (
    auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days)
  )
  returning * into requested;

  if required_points > 0 then
    update public.profiles
    set points_balance = points_balance - required_points
    where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;

commit;
-- <<< END MIGRATION: 20261012000001_harden_digital_access.sql

-- >>> BEGIN MIGRATION: 20261013_faculty_signup_departments.sql
begin;

create table if not exists public.academic_departments (
  id bigint generated by default as identity primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists academic_departments_name_lower_unique
  on public.academic_departments (lower(name));

insert into public.academic_departments (name)
select min(trim(department))
from public.profiles
where nullif(trim(department), '') is not null
group by lower(trim(department))
on conflict do nothing;

alter table public.academic_departments enable row level security;

drop policy if exists academic_departments_read_active on public.academic_departments;
create policy academic_departments_read_active
  on public.academic_departments
  for select to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists academic_departments_admin_manage on public.academic_departments;
create policy academic_departments_admin_manage
  on public.academic_departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.academic_departments to anon, authenticated;
grant insert, update, delete on public.academic_departments to authenticated;
grant usage, select on sequence public.academic_departments_id_seq to authenticated;

create or replace function public.provision_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := case
    when lower(trim(coalesce(new.raw_user_meta_data ->> 'member_type', ''))) = 'faculty' then 'faculty'
    else 'student'
  end;

  if requested_role = 'faculty' and not exists (
    select 1
    from public.academic_departments
    where is_active
      and lower(name) = lower(trim(coalesce(new.raw_user_meta_data ->> 'department', '')))
  ) then
    raise exception 'Choose an active department to create a faculty account';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), requested_role)
  on conflict (id) do update set email = excluded.email;

  update public.profiles
  set full_name = nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      school = nullif(trim(coalesce(new.raw_user_meta_data ->> 'school', '')), ''),
      department = nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), ''),
      course = nullif(trim(coalesce(new.raw_user_meta_data ->> 'course', '')), ''),
      student_year = nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_year', '')), '')
  where id = new.id;
  return new;
end;
$$;

commit;
-- <<< END MIGRATION: 20261013_faculty_signup_departments.sql

-- >>> BEGIN MIGRATION: 20261014_duration_based_points.sql
-- Apply after the digital access hardening migration on an existing database.
-- Point costs scale with the selected lending period and only current UI
-- durations are accepted by the database RPC.
begin;

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select access_points, access_mode, catalog_type
  into book_points, book_mode, book_catalog_type
  from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  if book_mode = 'restricted' then raise exception 'Administrator access required'; end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' then ceil(book_points * p_duration_days / 7.0)::integer
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points
  from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (
    auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days)
  )
  returning * into requested;

  if required_points > 0 then
    update public.profiles
    set points_balance = points_balance - required_points
    where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;

revoke all on function public.return_digital_loan(bigint) from public, anon, authenticated;

commit;
-- <<< END MIGRATION: 20261014_duration_based_points.sql

-- >>> BEGIN MIGRATION: 20261015_automate_digital_borrowing.sql
-- Normalize legacy digital books and keep digital borrowing automatic.
-- Free books are approved immediately. Points books are approved immediately
-- after the database atomically verifies and charges the member's balance.
begin;

alter table public.books alter column access_mode set default 'free';
update public.books
set access_mode = case when access_points > 0 then 'points' else 'free' end
where access_mode in ('loan', 'restricted');

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select access_points, access_mode, catalog_type
  into book_points, book_mode, book_catalog_type
  from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;

  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  -- Legacy and restricted rows use the automatic free/points model.
  if book_mode in ('loan', 'restricted') then
    book_mode := case when book_points > 0 then 'points' else 'free' end;
  end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' then ceil(book_points * p_duration_days / 7.0)::integer
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points
  from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days))
  returning * into requested;

  if required_points > 0 then
    update public.profiles set points_balance = points_balance - required_points where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved',
    'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;

commit;
-- <<< END MIGRATION: 20261015_automate_digital_borrowing.sql

-- >>> BEGIN MIGRATION: 20261016_automated_library_maintenance.sql
-- Connect scheduled maintenance to the existing physical expiry, waitlist,
-- reminder, and overdue-fine workflows.
begin;

create or replace function public.system_run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  processed_count integer;
  fine_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select public.system_process_physical_reminders() into processed_count;
  perform public.calculate_overdue_fines();
  select count(*)::integer into fine_count from public.fines where status = 'unpaid';

  return jsonb_build_object(
    'processed', coalesce(processed_count, 0),
    'fines_updated', coalesce(fine_count, 0)
  );
end;
$$;

revoke all on function public.system_run_maintenance() from public, anon, authenticated;
grant execute on function public.system_run_maintenance() to service_role;

commit;
-- <<< END MIGRATION: 20261016_automated_library_maintenance.sql

-- >>> BEGIN MIGRATION: 20261017_automatic_standard_ebook_access.sql
-- Make every standard e-book unlock automatically.
-- Premium checkout remains disabled until a trusted payment provider is connected.
begin;

alter table public.books alter column access_mode set default 'free';

update public.books
set access_mode = case when access_points > 0 then 'points' else 'free' end
where access_mode in ('loan', 'restricted');

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select access_points, access_mode, catalog_type
  into book_points, book_mode, book_catalog_type
  from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;

  -- Legacy and restricted rows are normalized to the automatic free/points model.
  if book_mode in ('loan', 'restricted') then
    book_mode := case when book_points > 0 then 'points' else 'free' end;
  end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' then ceil(book_points * p_duration_days / 7.0)::integer
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days))
  returning * into requested;

  if required_points > 0 then
    update public.profiles set points_balance = points_balance - required_points where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved',
    'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;

commit;
-- <<< END MIGRATION: 20261017_automatic_standard_ebook_access.sql

-- >>> BEGIN MIGRATION: 20261018_harden_assistant_message_ownership.sql
-- Keep assistant messages inside sessions owned by the same authenticated user.
-- Apply this migration to existing Supabase projects.

drop policy if exists assistant_messages_manage_own on public.assistant_messages;

create policy assistant_messages_manage_own
on public.assistant_messages
for all
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.assistant_sessions s
    where s.id = assistant_messages.session_id
      and s.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.assistant_sessions s
    where s.id = assistant_messages.session_id
      and s.user_id = auth.uid()
  )
);
-- <<< END MIGRATION: 20261018_harden_assistant_message_ownership.sql

-- >>> BEGIN MIGRATION: 20261019_contribution_point_royalties.sql
-- Contributors receive 50% of points spent by other members on their approved material.
-- The remaining points stay with the library as the platform share.

alter table public.point_transactions
  drop constraint if exists point_transactions_transaction_type_check;
alter table public.point_transactions
  add constraint point_transactions_transaction_type_check
  check (transaction_type in ('contribution_reward', 'contribution_royalty', 'access_unlock', 'admin_adjustment'));

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  owner_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
  contributor_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select b.access_points, b.access_mode, b.catalog_type, c.user_id
  into book_points, book_mode, book_catalog_type, contributor_id
  from public.books b
  left join public.book_contributions c
    on c.approved_book_id = b.id and c.status = 'approved'
  where b.id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then
    raise exception 'Physical books use the physical circulation workflow';
  end if;
  if contributor_id = auth.uid() then
    raise exception 'Contributor access is permanent; no points unlock is required';
  end if;

  if book_mode in ('loan', 'restricted') then
    book_mode := case when book_points > 0 then 'points' else 'free' end;
  end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then
    raise exception 'This digital access mode is unavailable';
  end if;

  -- Contributors can always read their own approved material for free.
  required_points := case
    when book_mode = 'points' and contributor_id is distinct from auth.uid()
      then ceil(book_points * p_duration_days / 7.0)::integer
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days))
  returning * into requested;

  if required_points > 0 then
    update public.profiles
    set points_balance = points_balance - required_points
    where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');

    if contributor_id is not null and contributor_id <> auth.uid() then
      owner_points := required_points / 2;
      if owner_points > 0 then
        update public.profiles
        set points_balance = points_balance + owner_points
        where id = contributor_id;
        insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
        values (contributor_id, owner_points, 'contribution_royalty', requested.id,
          'Contributor share: 50% of points used to unlock material');
      end if;
    end if;
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;
-- <<< END MIGRATION: 20261019_contribution_point_royalties.sql

-- >>> BEGIN MIGRATION: 20261020_structured_profile_names.sql
-- Store structured names while retaining full_name for compatibility.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists middle_name text;
alter table public.profiles add column if not exists last_name text;

create or replace function public.provision_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  new_first_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  new_middle_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), '');
  new_last_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  composed_name text;
begin
  requested_role := case
    when lower(trim(coalesce(new.raw_user_meta_data ->> 'member_type', ''))) = 'faculty' then 'faculty'
    else 'student'
  end;

  if requested_role = 'faculty' and not exists (
    select 1 from public.academic_departments
    where is_active
      and lower(name) = lower(trim(coalesce(new.raw_user_meta_data ->> 'department', '')))
  ) then
    raise exception 'Choose an active department to create a faculty account';
  end if;

  composed_name := nullif(trim(concat_ws(' ', new_first_name, new_middle_name, new_last_name)), '');
  insert into public.profiles (id, email, role, first_name, middle_name, last_name, full_name)
  values (new.id, coalesce(new.email, ''), requested_role, new_first_name, new_middle_name, new_last_name,
    coalesce(composed_name, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')))
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name;

  update public.profiles
  set school = nullif(trim(coalesce(new.raw_user_meta_data ->> 'school', '')), ''),
      department = case when requested_role = 'faculty' then nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), '') else null end,
      course = case when requested_role = 'student' then nullif(trim(coalesce(new.raw_user_meta_data ->> 'course', '')), '') else null end,
      student_year = case when requested_role = 'student' then nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_year', '')), '') else null end
  where id = new.id;
  return new;
end;
$$;
-- <<< END MIGRATION: 20261020_structured_profile_names.sql

-- >>> BEGIN MIGRATION: 20261021_physical_book_loan_history.sql
-- Detailed physical-book loan ledger.
-- One row represents one actual checkout and remains after the book is returned.

create table if not exists public.physical_book_loan_history (
  id bigint generated by default as identity primary key,
  request_id bigint not null unique references public.physical_book_requests(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  book_id bigint not null references public.books(id) on delete restrict,
  copy_id bigint not null references public.physical_book_copies(id) on delete restrict,
  duration_days integer not null check (duration_days between 1 and 365),
  fee_amount numeric(10, 2) not null check (fee_amount >= 0),
  payment_method text not null check (payment_method in ('cash', 'gcash')),
  payment_status text not null check (payment_status in ('unpaid', 'pending_verification', 'paid')),
  checked_out_at timestamptz not null,
  due_date timestamptz not null,
  returned_at timestamptz,
  return_condition text check (return_condition is null or return_condition in ('available', 'damaged', 'lost', 'withdrawn')),
  status text not null default 'checked_out' check (status in ('checked_out', 'returned', 'lost')),
  receipt_number text,
  checked_out_by uuid references public.profiles(id) on delete set null,
  returned_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_physical_loan_history_book_date
  on public.physical_book_loan_history(book_id, checked_out_at desc);
create index if not exists idx_physical_loan_history_copy_date
  on public.physical_book_loan_history(copy_id, checked_out_at desc);
create index if not exists idx_physical_loan_history_student_date
  on public.physical_book_loan_history(student_id, checked_out_at desc);

create or replace function public.sync_physical_book_loan_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  copy_condition text;
begin
  if tg_op = 'UPDATE' and new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    insert into public.physical_book_loan_history (
      request_id, student_id, book_id, copy_id, duration_days, fee_amount,
      payment_method, payment_status, checked_out_at, due_date, status,
      receipt_number, checked_out_by
    ) values (
      new.id, new.student_id, new.book_id, new.copy_id, new.duration_days, new.fee_amount,
      new.payment_method, new.payment_status, coalesce(new.checked_out_at, now()),
      new.due_date, 'checked_out', new.receipt_number, auth.uid()
    )
    on conflict (request_id) do update set
      copy_id = excluded.copy_id,
      payment_status = excluded.payment_status,
      checked_out_at = excluded.checked_out_at,
      due_date = excluded.due_date,
      receipt_number = excluded.receipt_number,
      checked_out_by = excluded.checked_out_by,
      updated_at = now();
  elsif tg_op = 'UPDATE' and new.status in ('returned', 'lost') and old.status is distinct from new.status then
    select case
      when status in ('available', 'damaged', 'lost', 'withdrawn') then status
      else null
    end
    into copy_condition
    from public.physical_book_copies
    where id = new.copy_id;
    update public.physical_book_loan_history
    set status = new.status,
        returned_at = coalesce(new.returned_at, now()),
        return_condition = case
          when new.status = 'lost' then 'lost'
          else coalesce(copy_condition, return_condition, 'available')
        end,
        returned_by = auth.uid(),
        updated_at = now()
    where request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_physical_book_loan_history on public.physical_book_requests;
create trigger trg_sync_physical_book_loan_history
after insert or update of status, checked_out_at, due_date, returned_at, payment_status, receipt_number
on public.physical_book_requests
for each row execute function public.sync_physical_book_loan_history();

-- Backfill already completed or active physical loans when upgrading an existing project.
insert into public.physical_book_loan_history (
  request_id, student_id, book_id, copy_id, duration_days, fee_amount,
  payment_method, payment_status, checked_out_at, due_date, returned_at,
  return_condition, status, receipt_number
)
select
  r.id, r.student_id, r.book_id, r.copy_id, r.duration_days, r.fee_amount,
  r.payment_method, r.payment_status, r.checked_out_at, r.due_date, r.returned_at,
  case when r.status = 'lost' then 'lost' else null end,
  r.status, r.receipt_number
from public.physical_book_requests r
where r.status in ('checked_out', 'returned', 'lost')
  and r.copy_id is not null
  and r.checked_out_at is not null
on conflict (request_id) do nothing;

alter table public.physical_book_loan_history enable row level security;
drop policy if exists physical_loan_history_read_admin on public.physical_book_loan_history;
create policy physical_loan_history_read_admin
on public.physical_book_loan_history
for select to authenticated
using (public.is_admin());

grant select on public.physical_book_loan_history to authenticated;
-- <<< END MIGRATION: 20261021_physical_book_loan_history.sql

-- >>> BEGIN MIGRATION: 20261022_enable_digital_ebook_returns.sql
-- Allow authenticated members to return their own active digital loans through
-- the validated return_digital_loan security-definer function.
grant execute on function public.return_digital_loan(bigint) to authenticated;
-- <<< END MIGRATION: 20261022_enable_digital_ebook_returns.sql

-- >>> BEGIN MIGRATION: 20261023_remove_reviews_and_wishlists.sql
-- Remove the unused member review and wishlist features.
-- Apply this migration to existing databases after deploying the app update.

drop table if exists public.reviews cascade;
drop table if exists public.wishlists cascade;
-- <<< END MIGRATION: 20261023_remove_reviews_and_wishlists.sql

-- >>> BEGIN MIGRATION: 20261024_digital_book_loan_history.sql
-- Preserve a detailed timeline for every digital borrowing request.

alter table public.borrow_requests add column if not exists approved_at timestamptz;

create table if not exists public.digital_book_loan_history (
  id bigint generated by default as identity primary key,
  borrow_request_id bigint not null unique references public.borrow_requests(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  book_id bigint not null references public.books(id) on delete restrict,
  requested_at timestamptz not null,
  borrowed_at timestamptz,
  due_date timestamptz,
  returned_at timestamptz,
  duration_days integer not null check (duration_days between 1 and 90),
  renewal_count integer not null default 0 check (renewal_count >= 0),
  points_cost integer not null default 0 check (points_cost >= 0),
  status text not null check (status in ('pending', 'approved', 'rejected', 'returned', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_digital_loan_history_book_date
  on public.digital_book_loan_history(book_id, requested_at desc);
create index if not exists idx_digital_loan_history_student_date
  on public.digital_book_loan_history(student_id, requested_at desc);

create or replace function public.sync_digital_book_loan_history()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.digital_book_loan_history (
    borrow_request_id, student_id, book_id, requested_at, borrowed_at,
    due_date, returned_at, duration_days, renewal_count, points_cost, status
  ) values (
    new.id, new.student_id, new.book_id, new.request_date,
    coalesce(new.approved_at, case when new.status = 'approved' then new.request_date end),
    new.due_date, new.returned_date, new.duration_days, new.renewal_count,
    new.points_cost, new.status
  )
  on conflict (borrow_request_id) do update set
    student_id = excluded.student_id,
    book_id = excluded.book_id,
    requested_at = excluded.requested_at,
    borrowed_at = coalesce(public.digital_book_loan_history.borrowed_at, excluded.borrowed_at),
    due_date = excluded.due_date,
    returned_at = excluded.returned_at,
    duration_days = excluded.duration_days,
    renewal_count = excluded.renewal_count,
    points_cost = excluded.points_cost,
    status = excluded.status,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_digital_book_loan_history on public.borrow_requests;
create trigger trg_sync_digital_book_loan_history
after insert or update of status, approved_at, due_date, returned_date, renewal_count, points_cost, request_date
on public.borrow_requests
for each row execute function public.sync_digital_book_loan_history();

update public.borrow_requests
set approved_at = coalesce(approved_at, request_date)
where status = 'approved' and approved_at is null;

insert into public.digital_book_loan_history (
  borrow_request_id, student_id, book_id, requested_at, borrowed_at, due_date,
  returned_at, duration_days, renewal_count, points_cost, status
)
select id, student_id, book_id, request_date,
  coalesce(approved_at, case when status = 'approved' then request_date end),
  due_date, returned_date, duration_days, renewal_count, points_cost, status
from public.borrow_requests
on conflict (borrow_request_id) do update set
  due_date = excluded.due_date,
  returned_at = excluded.returned_at,
  renewal_count = excluded.renewal_count,
  status = excluded.status,
  updated_at = now();

alter table public.digital_book_loan_history enable row level security;
drop policy if exists digital_loan_history_read_own_or_admin on public.digital_book_loan_history;
create policy digital_loan_history_read_own_or_admin
on public.digital_book_loan_history
for select to authenticated
using (student_id = auth.uid() or public.is_admin());
grant select on public.digital_book_loan_history to authenticated;
-- <<< END MIGRATION: 20261024_digital_book_loan_history.sql

-- >>> BEGIN MIGRATION: 20261025_per_duration_digital_access_costs.sql
-- Store an independent points cost for each supported digital-access period.

alter table public.books
  add column if not exists access_costs jsonb not null default '{}'::jsonb;

alter table public.books
  drop constraint if exists books_access_costs_object_check;
alter table public.books
  add constraint books_access_costs_object_check
  check (jsonb_typeof(access_costs) = 'object');

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  owner_points integer;
  user_points integer;
  book_points integer;
  book_costs jsonb;
  book_mode text;
  book_catalog_type text;
  contributor_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select b.access_points, b.access_costs, b.access_mode, b.catalog_type, c.user_id
  into book_points, book_costs, book_mode, book_catalog_type, contributor_id
  from public.books b
  left join public.book_contributions c on c.approved_book_id = b.id and c.status = 'approved'
  where b.id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  if contributor_id = auth.uid() then raise exception 'Contributor access is permanent; no points unlock is required'; end if;
  if book_mode in ('loan', 'restricted') then
    book_mode := case when book_points > 0 then 'points' else 'free' end;
  end if;
  if book_mode = 'premium' then raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead'; end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' and contributor_id is distinct from auth.uid() then
      case
        when book_costs ? p_duration_days::text
          and (book_costs ->> p_duration_days::text) ~ '^[0-9]+$'
          then (book_costs ->> p_duration_days::text)::integer
        else ceil(book_points * p_duration_days / 7.0)::integer
      end
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then raise exception 'You already have an active request or loan for this resource'; end if;

  select points_balance into user_points from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days', required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, approved_at, due_date)
  values (auth.uid(), p_book_id, p_duration_days, required_points, 'approved', now(), now() + make_interval(days => p_duration_days))
  returning * into requested;
  if required_points > 0 then
    update public.profiles set points_balance = points_balance - required_points where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
    if contributor_id is not null and contributor_id <> auth.uid() then
      owner_points := required_points / 2;
      if owner_points > 0 then
        update public.profiles set points_balance = points_balance + owner_points where id = contributor_id;
        insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
        values (contributor_id, owner_points, 'contribution_royalty', requested.id, 'Contributor share: 50% of points used to unlock material');
      end if;
    end if;
  end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;
-- <<< END MIGRATION: 20261025_per_duration_digital_access_costs.sql

-- >>> BEGIN MIGRATION: 20261026_physical_fee_presets.sql
-- Keep physical-book fee periods aligned with the digital access presets.

create or replace function public.admin_set_physical_loan_option(
  p_book_id bigint,
  p_duration_days integer,
  p_fee_amount numeric,
  p_is_active boolean default true
)
returns public.physical_loan_options
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_option public.physical_loan_options;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) or p_fee_amount < 0 then
    raise exception 'Choose a supported duration and non-negative fee';
  end if;
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  values (p_book_id, p_duration_days, p_fee_amount, p_is_active)
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
  returning * into saved_option;
  return saved_option;
end;
$$;

grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;
-- <<< END MIGRATION: 20261026_physical_fee_presets.sql

-- >>> BEGIN MIGRATION: 20261027_physical_catalog_workflow.sql
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
-- <<< END MIGRATION: 20261027_physical_catalog_workflow.sql

-- >>> BEGIN MIGRATION: 20261028_librarian_role.sql
-- Add librarian as a full staff role with the same authorization as admin.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'faculty', 'admin', 'librarian'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'librarian')
  );
$$;

create or replace function public.prevent_student_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'librarian')
    ) then
    if old.role is distinct from new.role then
      raise exception 'Only an administrator can change account roles';
    end if;
    if old.points_balance is distinct from new.points_balance then
      raise exception 'Only an administrator or approved workflow can change points';
    end if;
    if old.email is distinct from new.email then
      raise exception 'Email changes must be handled by account authentication';
    end if;
    if old.faculty_rank_id is distinct from new.faculty_rank_id then
      raise exception 'Only an administrator can change faculty titles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_role_guard on public.profiles;
create trigger trg_profiles_role_guard
before update on public.profiles
for each row execute function public.prevent_student_role_change();

create or replace function public.admin_set_profile_role(target_user_id uuid, new_role text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare updated_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_role not in ('student', 'faculty', 'admin', 'librarian') then raise exception 'Invalid account role'; end if;
  update public.profiles set role = new_role where id = target_user_id returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Profile not found'; end if;
  return updated_profile;
end;
$$;

create or replace function public.admin_update_member_academics(
  target_user_id uuid, new_role text, new_school text, new_department text,
  new_course text, new_student_year text, new_faculty_rank_id bigint, new_course_ids bigint[]
)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare updated_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_role not in ('student', 'faculty', 'librarian') then raise exception 'Invalid member role'; end if;
  if char_length(trim(coalesce(new_school, ''))) > 120
    or char_length(trim(coalesce(new_department, ''))) > 120
    or char_length(trim(coalesce(new_course, ''))) > 120
    or char_length(trim(coalesce(new_student_year, ''))) > 40 then
    raise exception 'Profile details exceed the allowed length';
  end if;
  if new_role = 'faculty' and new_faculty_rank_id is not null
    and not exists (select 1 from public.faculty_ranks where id = new_faculty_rank_id and is_active) then
    raise exception 'Choose an active faculty rank';
  end if;
  if new_role = 'faculty' and coalesce(cardinality(new_course_ids), 0) > 0
    and exists (
      select 1 from unnest(new_course_ids) as selected(course_id)
      left join public.academic_courses c on c.id = selected.course_id
      where c.id is null or not c.is_active
    ) then
    raise exception 'Choose active courses';
  end if;
  update public.profiles
  set role = new_role,
      school = nullif(trim(coalesce(new_school, '')), ''),
      department = nullif(trim(coalesce(new_department, '')), ''),
      course = case when new_role = 'student' then nullif(trim(coalesce(new_course, '')), '') else null end,
      student_year = case when new_role = 'student' then nullif(trim(coalesce(new_student_year, '')), '') else null end,
      faculty_rank_id = case when new_role = 'faculty' then new_faculty_rank_id else null end
  where id = target_user_id and role in ('student', 'faculty', 'librarian')
  returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Member profile not found'; end if;
  delete from public.faculty_courses where faculty_id = target_user_id;
  if new_role = 'faculty' and coalesce(cardinality(new_course_ids), 0) > 0 then
    insert into public.faculty_courses(faculty_id, course_id)
    select target_user_id, distinct_course_id
    from (select distinct unnest(new_course_ids) as distinct_course_id) selected_courses;
  end if;
  return updated_profile;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;
grant execute on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint, bigint[]) to authenticated;

create or replace function public.request_physical_return(p_request_id bigint)
returns public.physical_book_requests
language plpgsql security definer set search_path = public
as $$
declare target_request public.physical_book_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_request from public.physical_book_requests
  where id = p_request_id and student_id = auth.uid() for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status <> 'checked_out' then raise exception 'This physical loan cannot request a return'; end if;
  update public.physical_book_requests set status = 'return_pending'
  where id = p_request_id returning * into target_request;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id, 'physical_return_requested', 'Physical return requested',
    'A borrower has requested to return a physical book at the library desk.', target_request.id
  from public.profiles p where p.role in ('admin', 'librarian');
  return target_request;
end;
$$;

grant execute on function public.request_physical_return(bigint) to authenticated;
-- <<< END MIGRATION: 20261028_librarian_role.sql

-- >>> BEGIN MIGRATION: 20261028000001_physical_checkout_time_assignment.sql
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
-- <<< END MIGRATION: 20261028000001_physical_checkout_time_assignment.sql

-- >>> BEGIN MIGRATION: 20261029_physical_return_completion.sql
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
-- <<< END MIGRATION: 20261029_physical_return_completion.sql

-- >>> BEGIN MIGRATION: 20261030_physical_request_staff_notification.sql
-- Keep the student request and staff queue synchronized with an in-app alert.

create or replace function public.notify_staff_of_physical_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id,
    'physical_request_created',
    'New physical-book request',
    'A member submitted a physical-book request that needs payment and checkout review.',
    new.id
  from public.profiles p
  where p.role in ('admin', 'librarian');
  return new;
end;
$$;

drop trigger if exists trg_notify_staff_of_physical_request on public.physical_book_requests;
create trigger trg_notify_staff_of_physical_request
after insert on public.physical_book_requests
for each row execute function public.notify_staff_of_physical_request();
-- <<< END MIGRATION: 20261030_physical_request_staff_notification.sql

-- >>> BEGIN MIGRATION: 20261031_physical_payment_audit.sql
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
-- <<< END MIGRATION: 20261031_physical_payment_audit.sql

-- >>> BEGIN MIGRATION: 20261032_enable_premium_ebooks.sql
-- Enable the existing staff-verified premium e-book purchase workflow.
-- Premium titles require payment evidence and staff approval; approval grants
-- permanent access and issues a digital receipt.

drop trigger if exists prevent_unverified_premium_ebook on public.books;

revoke all on function public.request_premium_ebook_purchase(bigint, text, text) from public, anon;
grant execute on function public.request_premium_ebook_purchase(bigint, text, text) to authenticated;

revoke all on function public.admin_decide_ebook_purchase(bigint, text) from public, anon;
grant execute on function public.admin_decide_ebook_purchase(bigint, text) to authenticated;
-- <<< END MIGRATION: 20261032_enable_premium_ebooks.sql

-- >>> BEGIN MIGRATION: 20261033_fix_points_unlock_deduction.sql
-- Security-definer point workflows must be able to update points_balance.
-- Direct member profile edits remain blocked by the trigger.

create or replace function public.prevent_student_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'librarian')
    ) then
    if old.role is distinct from new.role then  
      raise exception 'Only an administrator can change account roles';
    end if;
    if old.points_balance is distinct from new.points_balance
      and current_user not in ('postgres', 'service_role') then
      raise exception 'Only an administrator or approved workflow can change points';
    end if;
    if old.email is distinct from new.email then
      raise exception 'Email changes must be handled by account authentication';
    end if;
    if old.faculty_rank_id is distinct from new.faculty_rank_id then
      raise exception 'Only an administrator can change faculty titles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_role_guard on public.profiles;
create trigger trg_profiles_role_guard
before update on public.profiles
for each row execute function public.prevent_student_role_change();
-- <<< END MIGRATION: 20261033_fix_points_unlock_deduction.sql

-- >>> BEGIN MIGRATION: 20261034_archive_catalog_books.sql
alter table public.books
  add column if not exists is_archived boolean not null default false;

create index if not exists idx_books_active_catalog
  on public.books (title)
  where not is_archived;

create or replace function public.reject_archived_book_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.books
    where id = new.book_id and is_archived
  ) then
    raise exception 'This title has been removed from the catalog';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_archived_borrow_request on public.borrow_requests;
create trigger prevent_archived_borrow_request
before insert on public.borrow_requests
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_physical_request on public.physical_book_requests;
create trigger prevent_archived_physical_request
before insert on public.physical_book_requests
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_physical_waitlist on public.physical_book_waitlist;
create trigger prevent_archived_physical_waitlist
before insert on public.physical_book_waitlist
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_premium_purchase on public.ebook_purchase_requests;
create trigger prevent_archived_premium_purchase
before insert on public.ebook_purchase_requests
for each row execute function public.reject_archived_book_requests();

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
  where b.catalog_type in ('physical', 'hybrid') and not b.is_archived
  group by b.id order by b.title;
$$;

grant execute on function public.get_public_physical_catalog() to anon, authenticated;

create or replace function public.get_public_physical_copy(p_qr_token uuid)
returns table (
  copy_id bigint,
  book_id bigint,
  copy_code text,
  status text,
  due_date timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.book_id, c.copy_code, c.status, c.due_date
  from public.physical_book_copies c
  join public.books b on b.id = c.book_id
  where c.qr_token = p_qr_token
    and b.catalog_type in ('physical', 'hybrid')
    and not b.is_archived
  limit 1;
$$;

grant execute on function public.get_public_physical_copy(uuid) to anon, authenticated;
-- <<< END MIGRATION: 20261034_archive_catalog_books.sql

-- >>> BEGIN MIGRATION: 20261035_remove_contribution_reward_cap.sql
begin;

create or replace function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  created_book_id bigint;
  owner_path text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid contribution decision'; end if;
  if reward_points < 0 then raise exception 'Reward cannot be negative'; end if;
  if access_points < 0 then raise exception 'Access cost cannot be negative'; end if;

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
      title, author, category, description, pdf_url,
      storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type, access_points
    ) values (
      contribution.title, contribution.author, 'Community contribution', contribution.description, contribution.pdf_url,
      contribution.storage_provider, contribution.storage_file_id, contribution.storage_path,
      contribution.file_name, contribution.file_size, contribution.mime_type, access_points
    ) returning id into created_book_id;
    update public.profiles set points_balance = points_balance + reward_points where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved library contribution');
    end if;
  end if;

  update public.book_contributions
  set status = decision, points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = created_book_id, reviewed_by = auth.uid(), reviewed_at = now()
  where id = contribution.id returning * into contribution;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (contribution.user_id, 'contribution_review',
    case when decision = 'approved' then 'Contribution approved' else 'Contribution reviewed' end,
    case when decision = 'approved' then 'Your resource was added to the library.' else 'Your submitted resource was not approved.' end,
    contribution.id);
  return contribution;
end;
$$;

revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer) to authenticated;

commit;
-- <<< END MIGRATION: 20261035_remove_contribution_reward_cap.sql

-- >>> BEGIN MIGRATION: 20261036_physical_borrowing_policy.sql
begin;

alter table public.fines
  alter column borrow_request_id drop not null,
  add column if not exists physical_book_request_id bigint references public.physical_book_requests(id) on delete cascade,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists waived_at timestamptz,
  add column if not exists waiver_reason text;

alter table public.fines drop constraint if exists fines_status_check;
alter table public.fines
  add constraint fines_status_check check (status in ('unpaid', 'paid', 'waived'));
alter table public.fines drop constraint if exists fines_exactly_one_loan_check;
alter table public.fines
  add constraint fines_exactly_one_loan_check
  check (num_nonnulls(borrow_request_id, physical_book_request_id) = 1);
drop policy if exists fines_admin_update on public.fines;
revoke insert, update, delete on public.fines from authenticated;

create unique index if not exists idx_fines_physical_request
  on public.fines(physical_book_request_id)
  where physical_book_request_id is not null;

update public.fines
set status = 'waived',
    waived_at = now(),
    waiver_reason = 'Digital loans do not accrue overdue fines under the approved library policy.'
where status = 'unpaid' and borrow_request_id is not null;

create table if not exists public.library_holidays (
  holiday_date date primary key,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.library_holidays enable row level security;
drop policy if exists library_holidays_read_authenticated on public.library_holidays;
create policy library_holidays_read_authenticated on public.library_holidays
  for select to authenticated using (true);
drop policy if exists library_holidays_staff_insert on public.library_holidays;
create policy library_holidays_staff_insert on public.library_holidays
  for insert to authenticated with check (public.is_admin());
drop policy if exists library_holidays_staff_delete on public.library_holidays;
create policy library_holidays_staff_delete on public.library_holidays
  for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.library_holidays to authenticated;

insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
select id, 14, 0, true
from public.books
where catalog_type in ('physical', 'hybrid')
on conflict (book_id, duration_days) do nothing;

update public.physical_loan_options
set is_active = false
where duration_days <> 14 and is_active;

create or replace function public.admin_set_physical_loan_option(
  p_book_id bigint,
  p_duration_days integer,
  p_fee_amount numeric,
  p_is_active boolean default true
)
returns public.physical_loan_options
language plpgsql
security definer
set search_path = public
as $$
declare saved_option public.physical_loan_options;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_duration_days <> 14 or p_fee_amount < 0 then
    raise exception 'General-circulation physical books use a 14-day loan period and a non-negative checkout fee';
  end if;
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  values (p_book_id, 14, p_fee_amount, p_is_active)
  on conflict (book_id, duration_days)
  do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
  returning * into saved_option;
  return saved_option;
end;
$$;
grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;

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
    if overdue_physical or unpaid_total > 0 then
      raise exception 'New digital access is unavailable while an overdue physical item or unpaid physical fine remains.';
    end if;
  elsif tg_table_name = 'physical_book_waitlist' then
    if overdue_physical then
      raise exception 'Return overdue physical items before joining an availability queue.';
    end if;
    if unpaid_total >= 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is below ₱100.';
    end if;
  else
    if new.duration_days <> 14 then
      raise exception 'General-circulation physical books have a 14-day loan period.';
    end if;
    if overdue_physical then
      raise exception 'Return overdue physical items before requesting another physical book.';
    end if;
    if unpaid_total >= 100 then
      raise exception 'Borrowing privileges are suspended until your unpaid balance is below ₱100.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_digital_borrowing_policy on public.borrow_requests;
create trigger enforce_digital_borrowing_policy
before insert on public.borrow_requests
for each row execute function public.enforce_library_borrowing_policy();

drop trigger if exists enforce_physical_request_policy on public.physical_book_requests;
create trigger enforce_physical_request_policy
before insert on public.physical_book_requests
for each row execute function public.enforce_library_borrowing_policy();

drop trigger if exists enforce_physical_waitlist_policy on public.physical_book_waitlist;
create trigger enforce_physical_waitlist_policy
before insert on public.physical_book_waitlist
for each row execute function public.enforce_library_borrowing_policy();

create or replace function public.offer_next_physical_waitlist(p_book_id bigint, p_copy_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare next_member record;
begin
  perform public.calculate_overdue_fines();

  select waitlist.student_id into next_member
  from public.physical_book_waitlist waitlist
  where waitlist.book_id = p_book_id
    and not exists (
      select 1 from public.physical_book_requests request
      where request.student_id = waitlist.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    and (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = waitlist.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) < 100
  order by waitlist.created_at, waitlist.student_id
  limit 1;

  if next_member.student_id is not null then
    insert into public.notifications(user_id, event_type, title, message, reference_id)
    values (
      next_member.student_id, 'physical_book_available', 'A physical book is available',
      'A copy is available. Submit your request, then visit the library desk for payment and checkout confirmation.',
      p_book_id
    );
  end if;
  return null;
end;
$$;
revoke all on function public.offer_next_physical_waitlist(bigint, bigint) from public, anon, authenticated;
grant execute on function public.offer_next_physical_waitlist(bigint, bigint) to service_role;

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
  if daily_rate <> 5.00 then
    raise exception 'The approved general-circulation overdue rate is ₱5.00 per chargeable day.';
  end if;

  can_process_all := public.is_admin()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  if auth.uid() is null and not can_process_all then
    raise exception 'Authenticated member or library staff access required';
  end if;

  for loan in
    select id, student_id, copy_id, due_date, returned_at, status
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

    fine_through := least(end_local_date, due_local_date + 30);
    if end_local_date > due_local_date + 2 then
      select count(*)::integer into chargeable_days
      from generate_series(due_local_date + 3, fine_through, interval '1 day') as overdue_day(day)
      where extract(dow from overdue_day.day) <> 0
        and not exists (
          select 1 from public.library_holidays holiday
          where holiday.holiday_date = overdue_day.day::date
        );
    else
      chargeable_days := 0;
    end if;

    fine_amount := least(500.00, chargeable_days * 5.00);
    if fine_amount > 0 then
      insert into public.fines(
        physical_book_request_id, borrow_request_id, student_id, amount, status, created_at
      ) values (
        loan.id, null, loan.student_id, fine_amount, 'unpaid', now()
      )
      on conflict (physical_book_request_id) where physical_book_request_id is not null
      do update set amount = excluded.amount
      where public.fines.status <> 'paid';
    else
      update public.fines
      set status = 'waived',
          waived_at = now(),
          waiver_reason = 'Recalculated under the approved policy; no chargeable overdue days remain.'
      where physical_book_request_id = loan.id and status = 'unpaid';
    end if;

    if loan.status in ('checked_out', 'return_pending')
      and local_today >= due_local_date + 30 then
      update public.physical_book_requests set status = 'lost'
      where id = loan.id and status in ('checked_out', 'return_pending');
      update public.physical_book_copies
      set status = 'lost', checked_out_at = null, due_date = null
      where id = loan.copy_id;
      insert into public.notifications(user_id, event_type, title, message, reference_id)
      values (
        loan.student_id, 'physical_item_classified_lost', 'Physical book classified as lost',
        'This physical book has been overdue for 30 consecutive days. Late-fine accrual has stopped; contact the library to resolve the lost-item record.',
        loan.id
      );
    end if;
  end loop;

  delete from public.physical_book_waitlist waitlist
  where (can_process_all or waitlist.student_id = auth.uid())
    and (exists (
      select 1 from public.physical_book_requests request
      where request.student_id = waitlist.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    or (
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

create or replace function public.admin_record_physical_fine_payment(p_fine_id bigint)
returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare paid_fine public.fines;
begin
  if not public.is_admin() then raise exception 'Librarian or administrator access required'; end if;
  select * into paid_fine
  from public.fines
  where id = p_fine_id and physical_book_request_id is not null
  for update;
  if paid_fine.id is null then raise exception 'Physical fine not found'; end if;
  if paid_fine.status <> 'unpaid' then raise exception 'This fine is no longer unpaid'; end if;
  if exists (
    select 1 from public.physical_book_requests
    where id = paid_fine.physical_book_request_id and status in ('checked_out', 'return_pending')
  ) then
    raise exception 'The physical book must be returned or classified as lost before payment can be recorded.';
  end if;
  update public.fines
  set status = 'paid', paid_at = now(), paid_by = auth.uid()
  where id = p_fine_id returning * into paid_fine;
  return paid_fine;
end;
$$;
revoke all on function public.admin_record_physical_fine_payment(bigint) from public, anon;
grant execute on function public.admin_record_physical_fine_payment(bigint) to authenticated;

commit;
-- <<< END MIGRATION: 20261036_physical_borrowing_policy.sql

-- >>> BEGIN MIGRATION: 20261037_physical_availability_alerts.sql
begin;

create or replace function public.join_physical_book_waitlist(p_book_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to turn on availability alerts';
  end if;

  if exists (
    select 1 from public.physical_book_copies
    where book_id = p_book_id and status = 'available'
  ) then
    raise exception 'A copy is available now; submit a physical loan request instead';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = current_user_id and book_id = p_book_id
      and status in ('pending', 'checked_out')
  ) then
    raise exception 'You already have an open request or loan for this book';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = current_user_id and status in ('checked_out', 'lost')
      and (status = 'lost' or due_date < now())
  ) then
    raise exception 'Resolve your overdue or lost library book before turning on alerts';
  end if;

  insert into public.physical_book_waitlist(student_id, book_id)
  values (current_user_id, p_book_id)
  on conflict (student_id, book_id) do nothing;
end;
$$;

-- Keep the legacy RPC for callers; copy-state transitions now send the broadcast.
create or replace function public.offer_next_physical_waitlist(
  p_book_id bigint,
  p_copy_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;

create or replace function public.notify_physical_availability_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'available' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'available' then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.physical_book_copies copy
    where copy.book_id = new.book_id
      and copy.id <> new.id
      and copy.status = 'available'
  ) then
    return new;
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select alert.student_id,
    'physical_book_available',
    concat(coalesce(book.title, 'A physical book'), ' is available'),
    concat('A physical copy of "', coalesce(book.title, 'this book'), '" is available. Submit your request soon; this alert does not reserve a copy, and checkout is first come, first served.'),
    new.book_id
  from public.physical_book_waitlist alert
  join public.books book on book.id = alert.book_id
  where alert.book_id = new.book_id
    and not exists (
      select 1
      from public.physical_book_requests request
      where request.student_id = alert.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    and (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = alert.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) < 100;

  return new;
end;
$$;

drop trigger if exists notify_physical_availability_alerts on public.physical_book_copies;
create trigger notify_physical_availability_alerts
after insert or update of status on public.physical_book_copies
for each row execute function public.notify_physical_availability_alerts();

revoke all on function public.notify_physical_availability_alerts() from public, anon, authenticated;
revoke all on function public.offer_next_physical_waitlist(bigint, bigint) from public, anon, authenticated;
grant execute on function public.offer_next_physical_waitlist(bigint, bigint) to service_role;
grant execute on function public.join_physical_book_waitlist(bigint) to authenticated;

commit;
-- <<< END MIGRATION: 20261037_physical_availability_alerts.sql

-- >>> BEGIN MIGRATION: 20261038_closed_registration_role_boundaries.sql
begin;

-- Librarians keep the circulation workflows guarded by explicit staff-role
-- checks. The shared is_admin() predicate must represent administrators only.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_library_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'librarian')
  );
$$;
grant execute on function public.is_library_staff() to authenticated;

-- Physical circulation remains a librarian responsibility. Update the
-- physical-only RPC guards while the shared is_admin() guard becomes strict.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_update_physical_book', 'admin_close_physical_loan',
        'admin_update_physical_copy_location', 'admin_confirm_physical_checkout',
        'admin_set_physical_loan_option', 'admin_record_physical_fine_payment',
        'admin_resolve_lost_physical_loan', 'calculate_overdue_fines'
      )
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(definition, 'public.is_admin()', 'public.is_library_staff()');
    execute definition;
  end loop;
end;
$$;

drop policy if exists physical_copies_admin_manage on public.physical_book_copies;
create policy physical_copies_admin_manage on public.physical_book_copies
  for all to authenticated using (public.is_library_staff()) with check (public.is_library_staff());
drop policy if exists physical_loan_options_admin_manage on public.physical_loan_options;
create policy physical_loan_options_admin_manage on public.physical_loan_options
  for all to authenticated using (public.is_library_staff()) with check (public.is_library_staff());
drop policy if exists physical_requests_read_own_or_admin on public.physical_book_requests;
create policy physical_requests_read_own_or_admin on public.physical_book_requests
  for select to authenticated using (student_id = auth.uid() or public.is_library_staff());
drop policy if exists physical_waitlist_read_own_or_admin on public.physical_book_waitlist;
create policy physical_waitlist_read_own_or_admin on public.physical_book_waitlist
  for select to authenticated using (student_id = auth.uid() or public.is_library_staff());
drop policy if exists physical_loan_history_read_admin on public.physical_book_loan_history;
create policy physical_loan_history_read_admin on public.physical_book_loan_history
  for select to authenticated using (public.is_library_staff());
drop policy if exists fines_read_own_or_admin on public.fines;
create policy fines_read_own_or_admin on public.fines
  for select to authenticated using (student_id = auth.uid() or public.is_library_staff());
drop policy if exists library_holidays_staff_insert on public.library_holidays;
create policy library_holidays_staff_insert on public.library_holidays
  for insert to authenticated with check (public.is_library_staff());
drop policy if exists library_holidays_staff_delete on public.library_holidays;
create policy library_holidays_staff_delete on public.library_holidays
  for delete to authenticated using (public.is_library_staff());

alter table public.fines add column if not exists fine_reason text;

create or replace function public.admin_add_lost_book_fine(
  p_request_id bigint,
  p_amount numeric,
  p_reason text
)
returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  saved_fine public.fines;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter a fine amount greater than zero and no more than 100,000'; end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 500 then raise exception 'Enter a reason up to 500 characters'; end if;

  select * into target_request
  from public.physical_book_requests
  where id = p_request_id and status = 'lost'
  for update;
  if target_request.id is null then raise exception 'An additional fine can only be added to a lost physical book'; end if;

  insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_reason)
  values (target_request.id, null, target_request.student_id, round(p_amount, 2), 'unpaid', now(), trim(p_reason))
  on conflict (physical_book_request_id) where physical_book_request_id is not null
  do update set amount = public.fines.amount + excluded.amount,
                status = 'unpaid',
                fine_reason = concat_ws('; ', nullif(public.fines.fine_reason, ''), excluded.fine_reason)
  where public.fines.status <> 'paid'
  returning * into saved_fine;

  if saved_fine.id is null then raise exception 'The fine has already been paid and cannot be increased'; end if;
  return saved_fine;
end;
$$;
revoke all on function public.admin_add_lost_book_fine(bigint, numeric, text) from public, anon;
grant execute on function public.admin_add_lost_book_fine(bigint, numeric, text) to authenticated;

create or replace function public.prevent_student_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
    and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    if old.role is distinct from new.role then
      raise exception 'Only an administrator can change account roles';
    end if;
    if old.points_balance is distinct from new.points_balance
      and current_user not in ('postgres', 'service_role') then
      raise exception 'Only an administrator or approved workflow can change points';
    end if;
    if old.email is distinct from new.email then
      raise exception 'Email changes must be handled by account authentication';
    end if;
    if old.faculty_rank_id is distinct from new.faculty_rank_id then
      raise exception 'Only an administrator can change faculty titles';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "Students upload contribution PDFs" on storage.objects;
drop policy if exists "Faculty upload course materials" on storage.objects;
create policy "Faculty upload course materials" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ebooks'
  and name like 'contributions/' || auth.uid()::text || '/%'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'faculty')
);

-- Public Auth sign-up must be disabled in Supabase Auth configuration. An
-- auth.users trigger cannot distinguish Auth Admin invitations from sign-ups.
drop trigger if exists trg_reject_public_account_registration on auth.users;
drop function if exists public.reject_public_account_registration();

-- Only faculty may submit or revise supplementary academic materials.
create or replace function public.guard_faculty_contributions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('faculty', 'admin')
  ) then
    raise exception 'Only faculty accounts may submit or revise learning materials';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_faculty_contributions_only on public.book_contributions;
create trigger trg_faculty_contributions_only
before insert or update on public.book_contributions
for each row execute function public.guard_faculty_contributions();

-- Keep department choices aligned with the college structure. Unknown legacy
-- profile department strings are cleared before the obsolete choices are removed.
insert into public.academic_departments (name, is_active)
values ('IT Department', true), ('Courses Department', true)
on conflict do nothing;

update public.profiles
set department = null
where department is not null
  and lower(trim(department)) not in ('it department', 'courses department');

update public.academic_departments
set name = case lower(trim(name))
  when 'it department' then 'IT Department'
  when 'courses department' then 'Courses Department'
  else name
end,
is_active = lower(trim(name)) in ('it department', 'courses department');

delete from public.academic_departments
where lower(trim(name)) not in ('it department', 'courses department');

alter table public.academic_departments
  drop constraint if exists academic_departments_school_choices;
alter table public.academic_departments
  add constraint academic_departments_school_choices
  check (name in ('IT Department', 'Courses Department') and is_active);

alter table public.profiles
  drop constraint if exists profiles_school_department_choices;
alter table public.profiles
  add constraint profiles_school_department_choices
  check (
    role not in ('student', 'faculty')
    or department is null
    or department in ('IT Department', 'Courses Department')
  );

commit;
-- <<< END MIGRATION: 20261038_closed_registration_role_boundaries.sql

-- >>> BEGIN MIGRATION: 20261039_staff_receipts_and_member_return_controls.sql
    begin;

    update storage.buckets set allowed_mime_types = array['application/pdf', 'application/epub+zip'] where id = 'ebooks';

    -- Members do not self-return digital or physical loans; staff process returns at the desk.
    revoke all on function public.return_digital_loan(bigint) from public, anon, authenticated;
    revoke all on function public.request_physical_return(bigint) from public, anon, authenticated;

    -- Fine payments are settled by library staff and receive a student-visible receipt.
    alter table public.fines add column if not exists receipt_number text;
    create unique index if not exists fines_receipt_number_unique on public.fines(receipt_number) where receipt_number is not null;

    create or replace function public.admin_record_physical_fine_payment(p_fine_id bigint)
    returns public.fines language plpgsql security definer set search_path = public
    as $$
    declare paid_fine public.fines;
    begin
      if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
      select * into paid_fine from public.fines where id = p_fine_id and physical_book_request_id is not null for update;
      if paid_fine.id is null then raise exception 'Physical fine not found'; end if;
      if paid_fine.status <> 'unpaid' then raise exception 'This fine is no longer unpaid'; end if;
      if exists (select 1 from public.physical_book_requests where id = paid_fine.physical_book_request_id and status in ('checked_out', 'return_pending')) then
        raise exception 'The physical book must be returned or classified as lost first.';
      end if;
      update public.fines set status = 'paid', paid_at = now(), paid_by = auth.uid(),
        receipt_number = 'SF-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(p_fine_id::text, 6, '0')
      where id = p_fine_id returning * into paid_fine;
      return paid_fine;
    end;
    $$;
    revoke all on function public.admin_record_physical_fine_payment(bigint) from public, anon;
    grant execute on function public.admin_record_physical_fine_payment(bigint) to authenticated;

    -- Close a lost physical loan and add its required staff-assessed fine atomically.
    create or replace function public.admin_close_physical_loan_with_fine(
      p_request_id bigint, p_amount numeric, p_reason text
    ) returns public.physical_book_requests
    language plpgsql security definer set search_path = public
    as $$
    declare saved_request public.physical_book_requests;
    begin
      if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
      if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter a fine amount greater than zero'; end if;
      if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then raise exception 'Enter a fine reason of 1 to 500 characters'; end if;
      perform public.admin_close_physical_loan(p_request_id, 'lost');
      perform public.admin_add_lost_book_fine(p_request_id, p_amount, trim(p_reason));
      select * into saved_request from public.physical_book_requests where id = p_request_id;
      return saved_request;
    end;
    $$;
    revoke all on function public.admin_close_physical_loan_with_fine(bigint, numeric, text) from public, anon;
    grant execute on function public.admin_close_physical_loan_with_fine(bigint, numeric, text) to authenticated;

    -- Print-service payments have their own staff-issued receipt history.
    create table if not exists public.library_print_payments (
      id bigint generated by default as identity primary key,
      student_id uuid not null references public.profiles(id) on delete restrict,
      amount numeric(10,2) not null check (amount > 0),
      description text not null check (char_length(trim(description)) between 1 and 240),
      receipt_number text unique,
      issued_by uuid not null references public.profiles(id) on delete restrict,
      created_at timestamptz not null default now()
    );
    comment on column public.library_print_payments.amount is 'Amount in Philippine pesos (PHP).';
    create index if not exists library_print_payments_student_created_idx on public.library_print_payments(student_id, created_at desc);
    alter table public.library_print_payments enable row level security;
    drop policy if exists library_print_payments_read_own_or_staff on public.library_print_payments;
    create policy library_print_payments_read_own_or_staff on public.library_print_payments
      for select to authenticated using (student_id = auth.uid() or public.is_library_staff());
    grant select on public.library_print_payments to authenticated;
    revoke insert, update, delete on public.library_print_payments from public, anon, authenticated;
    grant all on public.library_print_payments to service_role;

    create or replace function public.admin_issue_print_payment_receipt(
      p_student_id uuid, p_amount numeric, p_description text
    ) returns public.library_print_payments
    language plpgsql security definer set search_path = public
    as $$
    declare receipt public.library_print_payments;
    begin
      if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
      if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter an amount greater than zero and no more than 100,000'; end if;
      if nullif(trim(coalesce(p_description, '')), '') is null or char_length(trim(p_description)) > 240 then raise exception 'Enter a payment description of 1 to 240 characters'; end if;
      if not exists (select 1 from public.profiles where id = p_student_id and role in ('student', 'faculty')) then raise exception 'Choose an active student or faculty member'; end if;
      insert into public.library_print_payments(student_id, amount, description, issued_by)
        values (p_student_id, round(p_amount, 2), trim(p_description), auth.uid()) returning * into receipt;
      update public.library_print_payments set receipt_number = 'SP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(receipt.id::text, 6, '0')
        where id = receipt.id returning * into receipt;
      return receipt;
    end;
    $$;
    revoke all on function public.admin_issue_print_payment_receipt(uuid, numeric, text) from public, anon;
    grant execute on function public.admin_issue_print_payment_receipt(uuid, numeric, text) to authenticated;

    commit;
-- <<< END MIGRATION: 20261039_staff_receipts_and_member_return_controls.sql

-- >>> BEGIN MIGRATION: 20261040_physical_return_inspections_and_fine_components.sql
begin;

-- Keep late charges, lost-item assessments, and damage assessments as separate
-- auditable rows. Older records are classified conservatively from their notes.
alter table public.fines add column if not exists fine_type text;
update public.fines
set fine_type = case
  when physical_book_request_id is null then 'other'
  when fine_reason is null or trim(fine_reason) = '' then 'late_fee'
  when fine_reason ilike '%damage%' then 'damage'
  when fine_reason ilike '%lost%' then 'lost_item'
  else 'other'
end
where fine_type is null;    
alter table public.fines alter column fine_type set default 'other';
alter table public.fines alter column fine_type set not null;
alter table public.fines drop constraint if exists fines_fine_type_check;
alter table public.fines add constraint fines_fine_type_check
  check (fine_type in ('late_fee', 'lost_item', 'damage', 'other'));

drop index if exists public.idx_fines_physical_request;
create index if not exists fines_physical_request_type_idx
  on public.fines(physical_book_request_id, fine_type)
  where physical_book_request_id is not null;
create unique index if not exists fines_one_late_fee_per_physical_loan
  on public.fines(physical_book_request_id)
  where physical_book_request_id is not null and fine_type = 'late_fee';
create unique index if not exists fines_one_assessment_per_physical_loan
  on public.fines(physical_book_request_id, fine_type)
  where physical_book_request_id is not null and fine_type in ('lost_item', 'damage');

-- Preserve one automatically recalculated overdue charge while allowing separate
-- staff-assessed charges to remain independently reviewable and payable.
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
  if daily_rate <> 5.00 then
    raise exception 'The approved general-circulation overdue rate is PHP 5.00 per chargeable day.';
  end if;
  can_process_all := public.is_library_staff()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  if auth.uid() is null and not can_process_all then
    raise exception 'Authenticated member or library staff access required';
  end if;

  for loan in
    select id, student_id, copy_id, due_date, returned_at, status
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
    fine_through := least(end_local_date, due_local_date + 30);
    if end_local_date > due_local_date + 2 then
      select count(*)::integer into chargeable_days
      from generate_series(due_local_date + 3, fine_through, interval '1 day') as overdue_day(day)
      where extract(dow from overdue_day.day) <> 0
        and not exists (
          select 1 from public.library_holidays holiday
          where holiday.holiday_date = overdue_day.day::date
        );
    else
      chargeable_days := 0;
    end if;

    fine_amount := least(500.00, chargeable_days * 5.00);
    if fine_amount > 0 then
      insert into public.fines(
        physical_book_request_id, borrow_request_id, student_id, amount,
        status, created_at, fine_type, fine_reason
      ) values (
        loan.id, null, loan.student_id, fine_amount, 'unpaid', now(),
        'late_fee', 'Automatic overdue charge under the published library policy.'
      )
      on conflict (physical_book_request_id)
        where physical_book_request_id is not null and fine_type = 'late_fee'
      do update set amount = excluded.amount
      where public.fines.status <> 'paid';
    else
      update public.fines
      set status = 'waived',
          waived_at = now(),
          waiver_reason = 'Recalculated under the approved policy; no chargeable overdue days remain.'
      where physical_book_request_id = loan.id
        and fine_type = 'late_fee'
        and status = 'unpaid';
    end if;

    if loan.status in ('checked_out', 'return_pending')
      and local_today >= due_local_date + 30 then
      update public.physical_book_requests set status = 'lost'
      where id = loan.id and status in ('checked_out', 'return_pending');
      update public.physical_book_copies
      set status = 'lost', checked_out_at = null, due_date = null
      where id = loan.copy_id;
      insert into public.notifications(user_id, event_type, title, message, reference_id)
      values (
        loan.student_id, 'physical_item_classified_lost', 'Physical book classified as lost',
        'This physical book has been overdue for 30 consecutive days. Late-fine accrual has stopped; contact the library to resolve the lost-item record.',
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

-- Lost-item fees are staff assessments, separate from automatically calculated
-- overdue charges. Never merge unrelated fee components into a single row.
create or replace function public.admin_add_lost_book_fine(
  p_request_id bigint, p_amount numeric, p_reason text
) returns public.fines
language plpgsql security definer set search_path = public
as $$
declare target_request public.physical_book_requests; saved_fine public.fines;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter an assessed lost-item charge greater than zero and no more than 100,000'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then raise exception 'Enter the assessment reason (1 to 500 characters)'; end if;
  select * into target_request from public.physical_book_requests where id = p_request_id and status = 'lost' for update;
  if target_request.id is null then raise exception 'An assessed lost-item charge can only be added to a lost physical book'; end if;
  insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
  values (target_request.id, null, target_request.student_id, round(p_amount, 2), 'unpaid', now(), 'lost_item', trim(p_reason))
  returning * into saved_fine;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'lost_item_charge_assessed', 'physical_book_request', target_request.id,
    jsonb_build_object('fine_id', saved_fine.id, 'amount', saved_fine.amount, 'reason', saved_fine.fine_reason));
  return saved_fine;
end;
$$;
revoke all on function public.admin_add_lost_book_fine(bigint, numeric, text) from public, anon;
grant execute on function public.admin_add_lost_book_fine(bigint, numeric, text) to authenticated;

-- One atomic librarian action records physical inspection, copy disposition,
-- any assessed charge, and an inspection note in the durable loan ledger.
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
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'lost') then raise exception 'Choose available, damaged, or lost'; end if;
  if p_copy_condition in ('damaged', 'lost') then
    if p_assessed_amount is null or p_assessed_amount < 0 or p_assessed_amount > 100000 then raise exception 'Enter a non-negative assessed amount no greater than 100,000'; end if;
    if nullif(trim(coalesce(p_assessment_reason, '')), '') is null or char_length(trim(p_assessment_reason)) > 500 then raise exception 'Record the inspection or assessment reason (1 to 500 characters)'; end if;
    if p_copy_condition = 'lost' and p_assessed_amount <= 0 then raise exception 'Enter the staff-assessed lost-item charge'; end if;
  elsif coalesce(p_assessed_amount, 0) <> 0 or nullif(trim(coalesce(p_assessment_reason, '')), '') is not null then
    raise exception 'An assessment is only recorded for a damaged or lost item';
  end if;

  perform public.calculate_overdue_fines();
  select * into target_request from public.physical_book_requests where id = p_request_id for update;
  if target_request.id is null then raise exception 'Physical loan not found'; end if;
  if target_request.status = 'lost' and p_copy_condition <> 'lost' then
    return target_request;
  end if;

  if target_request.status in ('checked_out', 'return_pending') then
    perform public.admin_close_physical_loan(p_request_id, p_copy_condition);
  elsif not (target_request.status = 'lost' and p_copy_condition = 'lost') then
    raise exception 'This physical loan is no longer awaiting return inspection';
  end if;

  select * into saved_request from public.physical_book_requests where id = p_request_id;
  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
    case when p_copy_condition = 'available' then 'Return inspection: copy checked and available.'
         when p_copy_condition = 'damaged' then 'Damage assessment: ' || trim(p_assessment_reason)
         else 'Lost-item assessment: ' || trim(p_assessment_reason) end),
      updated_at = now()
  where request_id = p_request_id;

  if p_assessed_amount > 0 and p_copy_condition in ('damaged', 'lost') then
    insert into public.fines(physical_book_request_id, borrow_request_id, student_id, amount, status, created_at, fine_type, fine_reason)
    values (p_request_id, null, saved_request.student_id, round(p_assessed_amount, 2), 'unpaid', now(),
      case when p_copy_condition = 'damaged' then 'damage' else 'lost_item' end,
      trim(p_assessment_reason));
  end if;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'physical_return_inspected', 'physical_book_request', p_request_id,
    jsonb_build_object(
      'copy_condition', p_copy_condition,
      'assessed_amount', coalesce(p_assessed_amount, 0),
      'assessment_reason', nullif(trim(coalesce(p_assessment_reason, '')), '')
    )
  );
  return saved_request;
end;
$$;
revoke all on function public.admin_inspect_physical_return(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_inspect_physical_return(bigint, text, numeric, text) to authenticated;

commit;
-- <<< END MIGRATION: 20261040_physical_return_inspections_and_fine_components.sql

-- >>> BEGIN MIGRATION: 20261041_seed_mary_the_queen_college_programs.sql
begin;

-- Seed the college programs published by Mary the Queen College of Quezon City.
-- Administrators can add, deactivate, or rename choices in Academic Catalogs.
insert into public.academic_courses (name, is_active)
select program.name, true
from (values
  ('Bachelor of Elementary Education'),
  ('Bachelor of Secondary Education - English'),
  ('Bachelor of Secondary Education - Filipino'),
  ('Bachelor of Secondary Education - Mathematics'),
  ('Bachelor of Secondary Education - Science'),
  ('Bachelor of Secondary Education - Social Studies'),
  ('BS Accountancy'),
  ('BSCS'),
  ('BS Business Administration - Business Economics'),
  ('BS Business Administration - Finance Management'),
  ('BS Business Administration - Human Resource Development Management'),
  ('BS Business Administration - Marketing Management'),
  ('BS Business Administration - Operations Management'),
  ('BS Computer Engineering'),
  ('BS Criminology'),
  ('BS Hotel and Restaurant Management'),
  ('BSIT'),
  ('BS Psychology'),
  ('BS Tourism Management'),
  ('Diploma in Midwifery')
) as program(name)
where not exists (
  select 1 from public.academic_courses existing
  where lower(trim(existing.name)) = lower(trim(program.name))
)
on conflict (name) do nothing;

commit;
-- <<< END MIGRATION: 20261041_seed_mary_the_queen_college_programs.sql

-- >>> BEGIN MIGRATION: 20261042_validate_member_academic_edits.sql
begin;

-- Existing accounts can be edited to repair legacy academic values, but every
-- saved student and faculty profile must use active catalog choices.
create or replace function public.admin_update_member_academics(
  target_user_id uuid,
  new_role text,
  new_school text,
  new_department text,
  new_course text,
  new_student_year text,
  new_faculty_rank_id bigint,
  new_course_ids bigint[]
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_role is null or new_role not in ('student', 'faculty', 'librarian') then raise exception 'Invalid member role'; end if;
  if char_length(trim(coalesce(new_school, ''))) > 120
    or char_length(trim(coalesce(new_department, ''))) > 120
    or char_length(trim(coalesce(new_course, ''))) > 120
    or char_length(trim(coalesce(new_student_year, ''))) > 40 then
    raise exception 'Profile details exceed the allowed length';
  end if;

  if new_role = 'student' then
    if nullif(trim(coalesce(new_course, '')), '') is null
      or not exists (
        select 1 from public.academic_courses
        where is_active and name = trim(new_course)
      ) then
      raise exception 'Choose an active course program';
    end if;
    if new_student_year is null or trim(new_student_year) not in ('1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year') then
      raise exception 'Choose a valid year level';
    end if;
  end if;

  if new_role = 'faculty' then
    if nullif(trim(coalesce(new_department, '')), '') is null
      or not exists (
        select 1 from public.academic_departments
        where is_active and name = trim(new_department)
      ) then
      raise exception 'Choose an active faculty department';
    end if;
    if coalesce(cardinality(new_course_ids), 0) = 0 then
      raise exception 'Assign at least one course program to this faculty member';
    end if;
    if exists (
      select 1
      from unnest(new_course_ids) as selected(course_id)
      left join public.academic_courses course on course.id = selected.course_id
      where course.id is null or not course.is_active
    ) then
      raise exception 'Choose active faculty course programs';
    end if;
    if new_faculty_rank_id is not null and not exists (
      select 1 from public.faculty_ranks where id = new_faculty_rank_id and is_active
    ) then
      raise exception 'Choose an active faculty title';
    end if;
  end if;

  update public.profiles
  set role = new_role,
      school = nullif(trim(coalesce(new_school, '')), ''),
      department = case when new_role = 'faculty' then trim(new_department) else null end,
      course = case when new_role = 'student' then trim(new_course) else null end,
      student_year = case when new_role = 'student' then trim(new_student_year) else null end,
      faculty_rank_id = case when new_role = 'faculty' then new_faculty_rank_id else null end
  where id = target_user_id and role in ('student', 'faculty', 'librarian')
  returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Member profile not found'; end if;

  delete from public.faculty_courses where faculty_id = target_user_id;
  if new_role = 'faculty' then
    insert into public.faculty_courses(faculty_id, course_id)
    select target_user_id, distinct_course_id
    from (select distinct unnest(new_course_ids) as distinct_course_id) selected_courses;
  end if;
  return updated_profile;
end;
$$;

revoke all on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint, bigint[]) from public, anon;
grant execute on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint, bigint[]) to authenticated;

commit;
-- <<< END MIGRATION: 20261042_validate_member_academic_edits.sql

-- >>> BEGIN MIGRATION: 20261043_resolve_recovered_physical_items.sql
begin;

-- Staff can close a disputed or incorrect physical fine with a required,
-- auditable reason. Members cannot edit or waive their own charges.
create or replace function public.admin_waive_physical_fine(
  p_fine_id bigint,
  p_reason text
) returns public.fines
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fine public.fines;
  loan_status text;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or char_length(trim(p_reason)) > 500 then
    raise exception 'Enter a waiver reason of 1 to 500 characters';
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
  update public.fines
  set status = 'waived', waived_at = now(), waiver_reason = trim(p_reason)
  where id = p_fine_id returning * into target_fine;
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_fine_waived', 'fine', target_fine.id,
    jsonb_build_object('physical_book_request_id', target_fine.physical_book_request_id,
      'student_id', target_fine.student_id, 'fine_type', target_fine.fine_type,
      'amount', target_fine.amount, 'reason', target_fine.waiver_reason));
  return target_fine;
end;
$$;
revoke all on function public.admin_waive_physical_fine(bigint, text) from public, anon;
grant execute on function public.admin_waive_physical_fine(bigint, text) to authenticated;

-- Recovered lost books must not keep an unpaid replacement assessment. If the
-- recovered copy is damaged, record its separate staff-assessed charge here.
drop function if exists public.admin_resolve_lost_physical_loan(bigint, text);
create or replace function public.admin_resolve_lost_physical_loan(
  p_request_id bigint,
  p_copy_condition text,
  p_damage_amount numeric default 0,
  p_damage_reason text default null
) returns public.physical_book_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  waived_lost_amount numeric(10,2) := 0;
  paid_lost_amount numeric(10,2) := 0;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_copy_condition is null or p_copy_condition not in ('available', 'damaged', 'withdrawn') then
    raise exception 'Choose a valid found-copy condition';
  end if;
  if p_copy_condition = 'damaged' then
    if p_damage_amount is null or p_damage_amount < 0 or p_damage_amount > 100000 then
      raise exception 'Enter a non-negative assessed damage charge no greater than 100,000';
    end if;
    if nullif(trim(coalesce(p_damage_reason, '')), '') is null or char_length(trim(p_damage_reason)) > 500 then
      raise exception 'Record the damage inspection and assessment reason (1 to 500 characters)';
    end if;
  elsif coalesce(p_damage_amount, 0) <> 0 or nullif(trim(coalesce(p_damage_reason, '')), '') is not null then
    raise exception 'Damage details are only accepted when the recovered copy is damaged';
  end if;

  select * into target_request from public.physical_book_requests
  where id = p_request_id and status = 'lost' for update;
  if target_request.id is null then raise exception 'Lost physical loan not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('physical-book:' || target_request.book_id::text, 0));

  select coalesce(sum(amount), 0) into paid_lost_amount
  from public.fines
  where physical_book_request_id = p_request_id and fine_type = 'lost_item' and status = 'paid';

  with waived_fines as (
    update public.fines
    set status = 'waived',
        waived_at = now(),
        waiver_reason = 'Lost item recovered and accepted by library staff; replacement assessment waived.'
    where p_copy_condition in ('available', 'damaged')
      and physical_book_request_id = p_request_id
      and fine_type = 'lost_item'
      and status = 'unpaid'
    returning amount
  ) select coalesce(sum(amount), 0) into waived_lost_amount from waived_fines;

  update public.physical_book_copies
  set status = p_copy_condition, checked_out_at = null, due_date = null
  where id = target_request.copy_id;
  update public.physical_book_requests
  set status = 'returned', returned_at = now()
  where id = p_request_id returning * into target_request;

  if p_copy_condition = 'damaged' and p_damage_amount > 0 then
    if exists (select 1 from public.fines where physical_book_request_id = p_request_id and fine_type = 'damage') then
      raise exception 'A damage assessment is already recorded for this physical loan';
    end if;
    insert into public.fines(
      physical_book_request_id, borrow_request_id, student_id, amount,
      status, created_at, fine_type, fine_reason
    ) values (
      p_request_id, null, target_request.student_id, round(p_damage_amount, 2),
      'unpaid', now(), 'damage', trim(p_damage_reason)
    );
  end if;

  update public.physical_book_loan_history
  set notes = concat_ws(E'\n', nullif(notes, ''),
      case when p_copy_condition = 'damaged'
        then 'Recovered lost item; damage assessment: ' || trim(p_damage_reason)
        else 'Recovered lost item; copy disposition: ' || p_copy_condition end),
      updated_at = now()
  where request_id = p_request_id;

  if p_copy_condition = 'available' then
    perform public.offer_next_physical_waitlist(target_request.book_id, target_request.copy_id);
  end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (
    target_request.student_id,
    'physical_hold_resolved',
    'Recovered book record resolved',
    case when p_copy_condition = 'withdrawn'
      then 'The library closed the lost-item case as unresolved. Any lost-item assessment and separate overdue charges remain due; contact library staff if you believe this is incorrect.'
      when paid_lost_amount > 0
      then 'The library recovered the lost book and resolved the circulation hold. A prior replacement payment remains recorded; contact the library cashier if it needs review.'
      else 'The library recovered the lost book and resolved the circulation hold. Any unpaid replacement assessment was waived. Any separate late fee remains due.' end,
    target_request.id
  );
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_copy_condition = 'withdrawn' then 'physical_lost_loan_closed' else 'physical_lost_loan_recovered' end, 'physical_book_request', target_request.id,
    jsonb_build_object(
      'book_id', target_request.book_id,
      'copy_id', target_request.copy_id,
      'copy_condition', p_copy_condition,
      'waived_lost_assessment_amount', waived_lost_amount,
      'previously_paid_lost_assessment_amount', paid_lost_amount,
      'damage_assessed_amount', case when p_copy_condition = 'damaged' then round(coalesce(p_damage_amount, 0), 2) else 0 end,
      'damage_assessment_reason', case when p_copy_condition = 'damaged' then nullif(trim(coalesce(p_damage_reason, '')), '') else null end
    ));
  return target_request;
end;
$$;

revoke all on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) from public, anon;
grant execute on function public.admin_resolve_lost_physical_loan(bigint, text, numeric, text) to authenticated;

commit;
-- <<< END MIGRATION: 20261043_resolve_recovered_physical_items.sql

-- >>> BEGIN MIGRATION: 20261044_manageable_academic_faculty_catalog.sql
begin;

-- Faculty choices are managed by administrators. Keep historical profile values
-- intact while allowing the catalog to grow beyond its original two entries.
alter table public.academic_departments
  drop constraint if exists academic_departments_school_choices;

alter table public.profiles
  drop constraint if exists profiles_school_department_choices;

commit;
-- <<< END MIGRATION: 20261044_manageable_academic_faculty_catalog.sql

-- >>> BEGIN MIGRATION: 20261045_member_financial_realtime.sql
begin;

-- Keep member fines and receipt/payment lists current while a dashboard is open.
do $$
begin
  begin
    alter publication supabase_realtime add table public.fines;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.library_print_payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ebook_purchase_requests;
  exception when duplicate_object then null;
  end;
end;
$$;

commit;
-- <<< END MIGRATION: 20261045_member_financial_realtime.sql

-- >>> BEGIN MIGRATION: 20261046_member_loan_limit_and_activity_ledger.sql
begin;

-- Default library policy: a member may have no more than three active
-- physical loans. A return remains active until staff completes inspection.
create or replace function public.enforce_member_physical_loan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_loan_count integer;
begin
  if tg_op = 'INSERT'
     and new.status not in ('pending', 'checked_out', 'return_pending') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.status not in ('checked_out', 'return_pending') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('checked_out', 'return_pending') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('member-active-physical-loans:' || new.student_id::text, 0)
  );

  select count(*)::integer into active_loan_count
  from public.physical_book_requests request
  where request.student_id = new.student_id
    and request.status in ('checked_out', 'return_pending')
    and request.id is distinct from new.id;

  if active_loan_count >= 3 then
    raise exception 'The member already has three active physical loans. Complete a return before checking out another book.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_member_physical_loan_limit on public.physical_book_requests;
create trigger enforce_member_physical_loan_limit
before insert or update of status on public.physical_book_requests
for each row execute function public.enforce_member_physical_loan_limit();
revoke all on function public.enforce_member_physical_loan_limit() from public, anon, authenticated;

-- Append-only member activity ledger. Authoritative request, fine, payment,
-- points, and contribution tables remain the sources of truth.
create table if not exists public.member_activity_ledger (
  id bigint generated by default as identity primary key,
  -- Keep the account UUID as a historical identifier even if an account is
  -- later removed; no email or other personal data is copied into the ledger.
  member_id uuid not null,
  actor_id uuid,
  actor_role text not null check (actor_role in ('admin', 'librarian', 'faculty', 'student', 'system', 'historical')),
  occurred_at timestamptz not null default now(),
  event_type text not null,
  summary text not null check (char_length(trim(summary)) between 1 and 500),
  entity_type text not null,
  entity_id text,
  related_request_type text,
  related_request_id bigint,
  receipt_number text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists member_activity_ledger_member_time_idx
  on public.member_activity_ledger(member_id, occurred_at desc, id desc);
create index if not exists member_activity_ledger_entity_idx
  on public.member_activity_ledger(entity_type, entity_id, occurred_at desc);

alter table public.member_activity_ledger enable row level security;
drop policy if exists member_activity_ledger_read on public.member_activity_ledger;
create policy member_activity_ledger_read on public.member_activity_ledger
for select to authenticated
using (
  member_id = auth.uid()
  or public.is_admin()
  or (
    event_type in (
      'physical_request_submitted', 'physical_checkout_confirmed',
      'physical_return_requested', 'physical_book_returned',
      'physical_book_lost', 'physical_request_rejected',
      'physical_request_cancelled', 'physical_payment_updated',
      'physical_fine_assessed', 'physical_fine_paid', 'physical_fine_waived',
      'fine_assessed', 'fine_paid', 'fine_waived',
      'print_payment_recorded', 'availability_alert_enabled',
      'availability_alert_removed'
    )
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'librarian')
  )
);
revoke all on public.member_activity_ledger from public, anon, authenticated;
grant select (
  id, member_id, actor_role, occurred_at, event_type, summary,
  entity_type, entity_id, related_request_type, related_request_id,
  receipt_number, details
) on public.member_activity_ledger to authenticated;

create or replace function public.prevent_member_activity_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Member activity records are append-only';
end;
$$;
drop trigger if exists member_activity_ledger_no_update on public.member_activity_ledger;
create trigger member_activity_ledger_no_update
before update or delete on public.member_activity_ledger
for each row execute function public.prevent_member_activity_ledger_mutation();
revoke all on function public.prevent_member_activity_ledger_mutation() from public, anon, authenticated;

create or replace function public.record_member_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb;
  new_row jsonb;
  source_row jsonb;
  member_id_value uuid;
  actor_id_value uuid;
  actor_role_value text;
  event_type_value text;
  summary_value text;
  entity_id_value text;
  related_type_value text;
  related_id_value bigint;
  receipt_value text;
  reason_value text;
  details_value jsonb;
begin
  old_row := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  source_row := case when tg_op = 'DELETE' then old_row else new_row end;
  member_id_value := nullif(coalesce(source_row->>'student_id', source_row->>'user_id',
    source_row->>'member_id', case when tg_table_name = 'profiles' then source_row->>'id' end), '')::uuid;
  if member_id_value is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'library_print_payments'
       and old_row->>'receipt_number' is not distinct from new_row->>'receipt_number' then return new; end if;
    if tg_table_name = 'physical_book_requests'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'payment_status' is not distinct from new_row->>'payment_status'
       and old_row->>'receipt_number' is not distinct from new_row->>'receipt_number'
       and old_row->>'due_date' is not distinct from new_row->>'due_date'
       and old_row->>'returned_at' is not distinct from new_row->>'returned_at' then return new; end if;
    if tg_table_name = 'borrow_requests'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'due_date' is not distinct from new_row->>'due_date'
       and old_row->>'returned_date' is not distinct from new_row->>'returned_date'
       and old_row->>'renewal_count' is not distinct from new_row->>'renewal_count' then return new; end if;
    if tg_table_name = 'fines'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'amount' is not distinct from new_row->>'amount'
       and old_row->>'receipt_number' is not distinct from new_row->>'receipt_number'
       and old_row->>'fine_reason' is not distinct from new_row->>'fine_reason'
       and old_row->>'waiver_reason' is not distinct from new_row->>'waiver_reason' then return new; end if;
    if tg_table_name = 'ebook_purchase_requests'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'receipt_number' is not distinct from new_row->>'receipt_number' then return new; end if;
    if tg_table_name = 'book_contributions'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'points_awarded' is not distinct from new_row->>'points_awarded'
       and old_row->>'approved_book_id' is not distinct from new_row->>'approved_book_id' then return new; end if;
    if tg_table_name = 'profiles'
       and old_row->>'role' is not distinct from new_row->>'role'
       and old_row->>'full_name' is not distinct from new_row->>'full_name'
       and old_row->>'department' is not distinct from new_row->>'department'
       and old_row->>'course' is not distinct from new_row->>'course'
       and old_row->>'student_year' is not distinct from new_row->>'student_year' then return new; end if;
  end if;

  actor_id_value := auth.uid();
  if actor_id_value is null then
    actor_role_value := 'system';
  else
    select role into actor_role_value from public.profiles where id = actor_id_value;
    actor_role_value := coalesce(actor_role_value, 'system');
  end if;

  entity_id_value := source_row->>'id';
  receipt_value := nullif(coalesce(new_row->>'receipt_number', old_row->>'receipt_number'), '');
  reason_value := nullif(coalesce(new_row->>'fine_reason', new_row->>'waiver_reason', old_row->>'fine_reason', old_row->>'waiver_reason'), '');

  case tg_table_name
    when 'physical_book_requests' then
      entity_id_value := source_row->>'id';
      related_type_value := 'physical_request';
      related_id_value := nullif(source_row->>'id', '')::bigint;
      if tg_op = 'INSERT' then
        event_type_value := 'physical_request_submitted'; summary_value := 'Physical book request submitted.';
      elsif old_row->>'status' is distinct from new_row->>'status' then
        event_type_value := case new_row->>'status'
          when 'checked_out' then 'physical_checkout_confirmed'
          when 'return_pending' then 'physical_return_requested'
          when 'returned' then 'physical_book_returned'
          when 'lost' then 'physical_book_lost'
          when 'rejected' then 'physical_request_rejected'
          when 'cancelled' then 'physical_request_cancelled'
          else 'physical_request_status_changed' end;
        summary_value := case event_type_value
          when 'physical_checkout_confirmed' then 'Physical book checked out; checkout receipt and due date recorded.'
          when 'physical_return_requested' then 'Physical book return is awaiting staff inspection.'
          when 'physical_book_returned' then 'Physical book return completed by library staff.'
          when 'physical_book_lost' then 'Physical book recorded as lost.'
          when 'physical_request_rejected' then 'Physical book request rejected.'
          when 'physical_request_cancelled' then 'Physical book request cancelled.'
          else 'Physical book request status changed.' end;
      elsif old_row->>'payment_status' is distinct from new_row->>'payment_status' then
        event_type_value := 'physical_payment_updated'; summary_value := 'Physical book payment status updated.';
      else
        event_type_value := 'physical_loan_details_updated'; summary_value := 'Physical loan details updated.';
      end if;
    when 'borrow_requests' then
      related_type_value := 'digital_request'; related_id_value := nullif(source_row->>'id', '')::bigint;
      if tg_op = 'INSERT' and source_row->>'status' = 'approved' then
        event_type_value := 'digital_access_granted'; summary_value := 'Digital book access granted.';
      elsif tg_op = 'INSERT' then
        event_type_value := 'digital_request_submitted'; summary_value := 'Digital book access request submitted.';
      elsif old_row->>'status' is distinct from new_row->>'status' then
        event_type_value := 'digital_access_status_changed'; summary_value := 'Digital book access ' || coalesce(new_row->>'status', 'updated') || '.';
      else
        event_type_value := 'digital_access_renewed'; summary_value := 'Digital book access period updated.';
      end if;
    when 'fines' then
      related_type_value := case when source_row->>'physical_book_request_id' is not null then 'physical_request' else 'digital_request' end;
      related_id_value := nullif(coalesce(source_row->>'physical_book_request_id', source_row->>'borrow_request_id'), '')::bigint;
      if tg_op = 'INSERT' then
        event_type_value := case when source_row->>'physical_book_request_id' is not null then 'physical_fine_assessed' else 'fine_assessed' end;
        summary_value := 'Fine assessed: PHP ' || coalesce(source_row->>'amount', '0') || '.';
      elsif old_row->>'status' is distinct from new_row->>'status' and new_row->>'status' = 'paid' then
        event_type_value := case when source_row->>'physical_book_request_id' is not null then 'physical_fine_paid' else 'fine_paid' end;
        summary_value := 'Fine payment recorded: PHP ' || coalesce(source_row->>'amount', '0') || '.';
      elsif old_row->>'status' is distinct from new_row->>'status' and new_row->>'status' = 'waived' then
        event_type_value := case when source_row->>'physical_book_request_id' is not null then 'physical_fine_waived' else 'fine_waived' end;
        summary_value := 'Fine waived with a recorded reason.';
      else
        event_type_value := 'fine_updated'; summary_value := 'Fine assessment updated.';
      end if;
    when 'library_print_payments' then
      event_type_value := 'print_payment_recorded'; summary_value := 'Print payment recorded: PHP ' || coalesce(source_row->>'amount', '0') || '.';
      receipt_value := coalesce(source_row->>'receipt_number', receipt_value);
    when 'ebook_purchase_requests' then
      related_type_value := 'ebook_purchase'; related_id_value := nullif(source_row->>'id', '')::bigint;
      event_type_value := case when source_row->>'status' = 'approved' then 'ebook_purchase_approved' else 'ebook_purchase_status_changed' end;
      summary_value := 'Digital purchase ' || coalesce(source_row->>'status', 'updated') || '.';
    when 'point_transactions' then
      event_type_value := 'points_transaction'; summary_value := coalesce(source_row->>'description', 'Points balance changed.');
    when 'book_contributions' then
      related_type_value := 'contribution'; related_id_value := nullif(source_row->>'id', '')::bigint;
      event_type_value := case when tg_op = 'INSERT' then 'contribution_submitted' else 'contribution_status_changed' end;
      summary_value := case when tg_op = 'INSERT' then 'Academic material submitted for review.' else 'Academic material ' || coalesce(source_row->>'status', 'updated') || '.' end;
    when 'physical_book_waitlist' then
      event_type_value := case when tg_op = 'DELETE' then 'availability_alert_removed' else 'availability_alert_enabled' end;
      summary_value := case when tg_op = 'DELETE' then 'Physical book availability alert removed.' else 'Physical book availability alert enabled.' end;
    when 'profiles' then
      event_type_value := case when tg_op = 'INSERT' then 'account_provisioned' else 'profile_updated' end;
      summary_value := case when tg_op = 'INSERT' then 'Library member account provisioned.' else 'Member profile details updated.' end;
    else
      if tg_op = 'DELETE' then return old; end if;
      return new;
  end case;

  if tg_op = 'UPDATE' and old_row->>'receipt_number' is distinct from new_row->>'receipt_number' then
    receipt_value := new_row->>'receipt_number';
  end if;

  details_value := jsonb_strip_nulls(jsonb_build_object(
    'status_before', nullif(old_row->>'status', ''),
    'status_after', nullif(new_row->>'status', ''),
    'payment_status_before', nullif(old_row->>'payment_status', ''),
    'payment_status_after', nullif(new_row->>'payment_status', ''),
    'amount_before', nullif(old_row->>'amount', ''),
    'amount_after', nullif(coalesce(new_row->>'amount', new_row->>'fee_amount'), ''),
    'fine_type', nullif(source_row->>'fine_type', ''),
    'reason', reason_value,
    'receipt_number', receipt_value,
    'due_date', nullif(source_row->>'due_date', ''),
    'actor_role', actor_role_value
  ));

  insert into public.member_activity_ledger(
    member_id, actor_id, actor_role, event_type, summary, entity_type,
    entity_id, related_request_type, related_request_id, receipt_number, details
  ) values (
    member_id_value, actor_id_value, actor_role_value, event_type_value,
    left(coalesce(summary_value, 'Library account activity recorded.'), 500),
    tg_table_name, entity_id_value, related_type_value, related_id_value,
    receipt_value, details_value
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.record_member_activity_event() from public, anon, authenticated;

-- Preserve historical entries where the source tables contain a trustworthy
-- event timestamp. Older rows without a decision timestamp are not assigned a
-- fabricated checkout/return/payment event.
insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select student_id, 'historical', requested_at, 'physical_request_submitted',
  'Historical record: physical book request submitted.', 'physical_book_requests', id::text,
  'physical_request', id, receipt_number,
  jsonb_strip_nulls(jsonb_build_object('status_at_migration', status, 'amount', fee_amount))
from public.physical_book_requests;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select request.student_id, 'historical', request.checked_out_at,
  'physical_checkout_confirmed', 'Historical record: physical book checked out; receipt and due date were recorded.',
  'physical_book_requests', request.id::text, 'physical_request', request.id,
  request.receipt_number,
  jsonb_strip_nulls(jsonb_build_object('amount', request.fee_amount, 'due_date', request.due_date))
from public.physical_book_requests request
where request.checked_out_at is not null and request.status in ('checked_out', 'return_pending', 'returned', 'lost');

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select request.student_id, 'historical', request.returned_at,
  case when request.status = 'lost' then 'physical_book_lost' else 'physical_book_returned' end,
  case when request.status = 'lost' then 'Historical record: physical book classified as lost.' else 'Historical record: physical book return completed.' end,
  'physical_book_requests', request.id::text, 'physical_request', request.id,
  request.receipt_number, jsonb_build_object('status_at_migration', request.status)
from public.physical_book_requests request
where request.returned_at is not null and request.status in ('returned', 'lost');

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select fine.student_id, 'historical', fine.created_at,
  case when fine.physical_book_request_id is null then 'fine_assessed' else 'physical_fine_assessed' end,
  'Historical record: fine assessed, PHP ' || fine.amount::text || '.',
  'fines', fine.id::text,
  case when fine.physical_book_request_id is null then 'digital_request' else 'physical_request' end,
  coalesce(fine.physical_book_request_id, fine.borrow_request_id), fine.receipt_number,
  jsonb_strip_nulls(jsonb_build_object('amount', fine.amount, 'fine_type', fine.fine_type,
    'status_at_migration', fine.status, 'reason', fine.fine_reason))
from public.fines fine;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select fine.student_id, 'historical', fine.paid_at,
  case when fine.physical_book_request_id is null then 'fine_paid' else 'physical_fine_paid' end,
  'Historical record: fine payment recorded, PHP ' || fine.amount::text || '.',
  'fines', fine.id::text,
  case when fine.physical_book_request_id is null then 'digital_request' else 'physical_request' end,
  coalesce(fine.physical_book_request_id, fine.borrow_request_id), fine.receipt_number,
  jsonb_build_object('amount', fine.amount)
from public.fines fine
where fine.status = 'paid' and fine.paid_at is not null;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select fine.student_id, 'historical', fine.waived_at,
  case when fine.physical_book_request_id is null then 'fine_waived' else 'physical_fine_waived' end,
  'Historical record: fine waived with a recorded reason.',
  'fines', fine.id::text,
  case when fine.physical_book_request_id is null then 'digital_request' else 'physical_request' end,
  coalesce(fine.physical_book_request_id, fine.borrow_request_id), fine.receipt_number,
  jsonb_build_object('amount', fine.amount, 'reason', fine.waiver_reason)
from public.fines fine
where fine.status = 'waived' and fine.waived_at is not null;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, receipt_number, details
)
select payment.student_id, 'historical', payment.created_at, 'print_payment_recorded',
  'Historical record: print payment recorded, PHP ' || payment.amount::text || '.',
  'library_print_payments', payment.id::text, payment.receipt_number,
  jsonb_build_object('amount', payment.amount, 'description', payment.description)
from public.library_print_payments payment;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, receipt_number, details
)
select request.student_id, 'historical', request.request_date,
  'digital_request_submitted', 'Historical record: digital access request submitted.',
  'borrow_requests', request.id::text, 'digital_request', request.id,
  null, jsonb_strip_nulls(jsonb_build_object('status_at_migration', request.status, 'due_date', request.due_date, 'points_cost', request.points_cost))
from public.borrow_requests request;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type,
  entity_id, related_request_type, related_request_id, details
)
select request.student_id, 'historical', coalesce(request.approved_at, request.request_date),
  'digital_access_granted', 'Historical record: digital book access granted.',
  'borrow_requests', request.id::text, 'digital_request', request.id,
  jsonb_strip_nulls(jsonb_build_object('due_date', request.due_date, 'points_cost', request.points_cost))
from public.borrow_requests request where request.status = 'approved';

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type, entity_id, details
)
select transaction.user_id, 'historical', transaction.created_at, 'points_transaction',
  'Historical record: ' || transaction.description,
  'point_transactions', transaction.id::text,
  jsonb_build_object('amount_points', transaction.amount, 'transaction_type', transaction.transaction_type)
from public.point_transactions transaction;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type, entity_id, details
)
select contribution.user_id, 'historical', contribution.created_at, 'contribution_submitted',
  'Historical record: academic material submitted for review.',
  'book_contributions', contribution.id::text,
  jsonb_build_object('status_at_migration', contribution.status)
from public.book_contributions contribution;

insert into public.member_activity_ledger(
  member_id, actor_role, occurred_at, event_type, summary, entity_type, entity_id, details
)
select contribution.user_id, 'historical', contribution.reviewed_at, 'contribution_status_changed',
  'Historical record: academic material ' || contribution.status || '.',
  'book_contributions', contribution.id::text,
  jsonb_build_object('status_at_migration', contribution.status, 'points_awarded', contribution.points_awarded)
from public.book_contributions contribution where contribution.reviewed_at is not null;

drop trigger if exists ledger_physical_book_requests on public.physical_book_requests;
create trigger ledger_physical_book_requests after insert or update on public.physical_book_requests
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_borrow_requests on public.borrow_requests;
create trigger ledger_borrow_requests after insert or update on public.borrow_requests
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_fines on public.fines;
create trigger ledger_fines after insert or update on public.fines
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_print_payments on public.library_print_payments;
create trigger ledger_print_payments after update of receipt_number on public.library_print_payments
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_ebook_purchases on public.ebook_purchase_requests;
create trigger ledger_ebook_purchases after insert or update on public.ebook_purchase_requests
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_point_transactions on public.point_transactions;
create trigger ledger_point_transactions after insert on public.point_transactions
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_book_contributions on public.book_contributions;
create trigger ledger_book_contributions after insert or update on public.book_contributions
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_physical_waitlist on public.physical_book_waitlist;
create trigger ledger_physical_waitlist after insert or delete on public.physical_book_waitlist
for each row execute function public.record_member_activity_event();
drop trigger if exists ledger_member_profiles on public.profiles;
create trigger ledger_member_profiles after update of role, full_name, department, course, student_year on public.profiles
for each row execute function public.record_member_activity_event();

do $$
begin
  begin
    alter publication supabase_realtime add table public.member_activity_ledger;
  exception when duplicate_object then null;
  end;
end;
$$;

commit;
-- <<< END MIGRATION: 20261046_member_loan_limit_and_activity_ledger.sql

-- >>> BEGIN MIGRATION: 20261047_admin_provisioned_usernames.sql
begin;

-- Usernames are a sign-in alias. Supabase Auth continues to own passwords,
-- sessions, recovery, and account security. Existing records receive a
-- stable username based on their email prefix (with an ID suffix on collision).
alter table public.profiles add column if not exists username text;

do $$
declare
  member record;
  base_name text;
  candidate text;
  suffix integer;
begin
  for member in
    select id, email from public.profiles where username is null order by id
  loop
    base_name := regexp_replace(lower(split_part(coalesce(member.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g');
    if length(base_name) < 3 then base_name := 'member'; end if;
    candidate := left(base_name, 30);
    suffix := 0;
    while exists (select 1 from public.profiles p where lower(p.username) = candidate) loop
      suffix := suffix + 1;
      candidate := left(base_name, 23) || '-' || substr(member.id::text, 1, 6);
      if suffix > 1 then candidate := left(candidate, 26) || suffix::text; end if;
    end loop;
    update public.profiles set username = candidate where id = member.id;
  end loop;
end;
$$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username)) where username is not null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

commit;
-- <<< END MIGRATION: 20261047_admin_provisioned_usernames.sql

-- >>> BEGIN MIGRATION: 20261048_physical_loan_presets_and_catalog_editing.sql
  begin;

  -- Standard physical lending durations. Keep each title's fee independently
  -- configurable while guaranteeing the request RPC accepts only these presets.
  insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
  select book.id, duration.days, 0, true
  from public.books book
  cross join unnest(array[1, 3, 5, 7, 14, 30]) as duration(days)
  where book.catalog_type in ('physical', 'hybrid')
  on conflict (book_id, duration_days) do update set is_active = true;

  create or replace function public.initialize_physical_book_loan_options()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if new.catalog_type in ('physical', 'hybrid') then
      insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
      select new.id, duration.days, 0, true
      from unnest(array[1, 3, 5, 7, 14, 30]) as duration(days)
      on conflict (book_id, duration_days) do nothing;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists initialize_physical_book_loan_options on public.books;
  create trigger initialize_physical_book_loan_options
  after insert or update of catalog_type on public.books
  for each row execute function public.initialize_physical_book_loan_options();
  revoke all on function public.initialize_physical_book_loan_options() from public, anon, authenticated;

  create or replace function public.admin_set_physical_loan_option(
    p_book_id bigint,
    p_duration_days integer,
    p_fee_amount numeric,
    p_is_active boolean default true
  )
  returns public.physical_loan_options
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare saved_option public.physical_loan_options;
  begin
    if not public.is_admin() then raise exception 'Administrator access required'; end if;
    if p_duration_days not in (1, 3, 5, 7, 14, 30) then raise exception 'Choose a supported loan duration'; end if;
    if p_fee_amount is null or p_fee_amount < 0 or p_fee_amount > 100000 then
      raise exception 'Enter a non-negative fee no greater than 100,000';
    end if;
    if not exists (select 1 from public.books where id = p_book_id and catalog_type in ('physical', 'hybrid')) then
      raise exception 'Choose a physical or hybrid catalog title';
    end if;
    insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
    values (p_book_id, p_duration_days, round(p_fee_amount, 2), coalesce(p_is_active, true))
    on conflict (book_id, duration_days)
    do update set fee_amount = excluded.fee_amount, is_active = excluded.is_active
    returning * into saved_option;
    return saved_option;
  end;
  $$;
  revoke all on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) from public, anon;
  grant execute on function public.admin_set_physical_loan_option(bigint, integer, numeric, boolean) to authenticated;

  -- Save all title periods together so a partial network failure cannot leave a
  -- mixed set of stale and new fees.
  create or replace function public.admin_set_physical_loan_options(p_book_id bigint, p_options jsonb)
  returns setof public.physical_loan_options
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare option_count integer;
  begin
    if not public.is_admin() then raise exception 'Administrator access required'; end if;
    if not exists (select 1 from public.books where id = p_book_id and catalog_type in ('physical', 'hybrid')) then
      raise exception 'Choose a physical or hybrid catalog title';
    end if;
    if jsonb_typeof(p_options) <> 'array' then raise exception 'Loan options must be a list'; end if;

    select count(*) into option_count
    from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric);
    if option_count <> 6 or exists (
      select 1
      from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)
      where duration_days not in (1, 3, 5, 7, 14, 30)
        or fee_amount is null or fee_amount < 0 or fee_amount > 100000
    ) or (select count(distinct option_row.duration_days)
          from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)) <> 6 then
      raise exception 'Provide one valid non-negative fee for each duration: 1, 3, 5, 7, 14, and 30 days';
    end if;

    return query
    insert into public.physical_loan_options(book_id, duration_days, fee_amount, is_active)
    select p_book_id, option_row.duration_days, round(option_row.fee_amount, 2), true
    from jsonb_to_recordset(p_options) as option_row(duration_days integer, fee_amount numeric)
    on conflict (book_id, duration_days)
    do update set fee_amount = excluded.fee_amount, is_active = true
    returning *;
  end;
  $$;
  revoke all on function public.admin_set_physical_loan_options(bigint, jsonb) from public, anon;
  grant execute on function public.admin_set_physical_loan_options(bigint, jsonb) to authenticated;

  -- The current policy trigger was introduced in 20261036 with a fixed 14-day
  -- rule. Replace only that duration check and retain its fine/hold validation.
  do $$
  declare
    function_definition text;
    updated_definition text;
  begin
    select pg_get_functiondef(routine.oid) into function_definition
    from pg_proc routine join pg_namespace nsp on nsp.oid = routine.pronamespace
    where nsp.nspname = 'public' and routine.proname = 'enforce_library_borrowing_policy';
    if function_definition is null then raise exception 'Physical borrowing policy function was not found'; end if;

    updated_definition := regexp_replace(function_definition,
      'new[.]duration_days[[:space:]]*(<>|!=)[[:space:]]*14',
      'new.duration_days not in (1, 3, 5, 7, 14, 30)',
      'gi');
    if updated_definition = function_definition
      and function_definition !~* 'new[.]duration_days[[:space:]]+not[[:space:]]+in[[:space:]]*[(][[:space:]]*1[[:space:]]*,[[:space:]]*3[[:space:]]*,[[:space:]]*5[[:space:]]*,[[:space:]]*7[[:space:]]*,[[:space:]]*14[[:space:]]*,[[:space:]]*30[[:space:]]*[)]' then
      raise exception 'Unexpected physical borrowing policy; inspect before applying duration presets';
    end if;
    updated_definition := replace(updated_definition,
      'General-circulation physical books have a 14-day loan period.',
      'Choose a supported physical-book loan period: 1, 3, 5, 7, 14, or 30 days.');
    if updated_definition <> function_definition then
      execute updated_definition;
    end if;
  end;
  $$;

  commit;
-- <<< END MIGRATION: 20261048_physical_loan_presets_and_catalog_editing.sql

-- >>> BEGIN MIGRATION: 20261049_safe_catalog_book_deletion.sql
begin;

-- Permanent catalog deletion is limited to archived titles with no dependent
-- member activity, circulation, payment, or access records.

drop policy if exists books_admin_delete on public.books;
revoke delete on public.books from authenticated;

create or replace function public.admin_delete_catalog_book(p_book_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_book public.books;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  select * into target_book from public.books where id = p_book_id for update;
  if target_book.id is null then raise exception 'Book not found'; end if;
  if not target_book.is_archived then raise exception 'Archive this title before permanently deleting it'; end if;

  if exists (select 1 from public.borrow_requests where book_id = p_book_id)
    or exists (select 1 from public.digital_book_loan_history where book_id = p_book_id)
    or exists (select 1 from public.physical_book_requests where book_id = p_book_id)
    or exists (select 1 from public.physical_book_loan_history where book_id = p_book_id)
    or exists (select 1 from public.ebook_purchase_requests where book_id = p_book_id)
    or exists (select 1 from public.book_access_grants where book_id = p_book_id)
    or exists (select 1 from public.book_contributions where approved_book_id = p_book_id)
    or exists (select 1 from public.study_notes where book_id = p_book_id)
    or exists (select 1 from public.highlights where book_id = p_book_id)
    or exists (select 1 from public.study_drawings where book_id = p_book_id)
    or exists (select 1 from public.reading_progress where book_id = p_book_id)
    or exists (select 1 from public.physical_book_waitlist where book_id = p_book_id)
    or exists (select 1 from public.member_activity_ledger where entity_type = 'books' and entity_id = p_book_id::text)
    or exists (select 1 from public.audit_logs where (target_type = 'book' and target_id = p_book_id)
      or details ->> 'book_id' = p_book_id::text) then
    raise exception 'This title has member activity or circulation history and cannot be permanently deleted. Keep it archived instead.';
  end if;

  if nullif(trim(target_book.storage_path), '') is not null
    or nullif(trim(target_book.storage_file_id), '') is not null
    or nullif(trim(target_book.pdf_url), '') is not null then
    raise exception 'This title still has an attached file. Keep it archived instead.';
  end if;

  delete from public.books where id = p_book_id;
end;
$$;

revoke all on function public.admin_delete_catalog_book(bigint) from public, anon;
grant execute on function public.admin_delete_catalog_book(bigint) to authenticated;

commit;
-- <<< END MIGRATION: 20261049_safe_catalog_book_deletion.sql

-- >>> BEGIN MIGRATION: 20261050_free_and_points_only_digital_access.sql
begin;

-- Paid e-book checkout is retired. Keep historical payment records for audit,
-- but prevent new premium modes and remove the purchase RPC entry points.
update public.books
set access_mode = case
      when catalog_type = 'physical' and access_mode in ('free', 'points', 'restricted') then access_mode
      when catalog_type = 'physical' then 'restricted'
      when access_mode = 'points' or access_points > 0 then 'points'
      else 'free'
    end,
    premium_price = 0;

alter table public.books alter column access_mode set default 'free';
alter table public.books drop constraint if exists books_access_mode_free_points_check;
alter table public.books add constraint books_access_mode_free_points_check
  check (access_mode in ('free', 'points') or (catalog_type = 'physical' and access_mode = 'restricted'));

drop function if exists public.request_premium_ebook_purchase(bigint, text, text);
drop function if exists public.admin_decide_ebook_purchase(bigint, text);
drop policy if exists ebook_payment_proofs_upload_own on storage.objects;

commit;
-- <<< END MIGRATION: 20261050_free_and_points_only_digital_access.sql

-- >>> BEGIN MIGRATION: 20261051_retire_manual_temporary_access.sql
begin;

-- Manual temporary access is no longer part of the staff workflow. Keep
-- existing grant rows intact so current access and member history continue.
drop function if exists public.admin_grant_book_access(uuid, bigint, integer, text);

commit;
-- <<< END MIGRATION: 20261051_retire_manual_temporary_access.sql

-- >>> BEGIN MIGRATION: 20261052_prevent_duplicate_physical_titles.sql
begin;

-- A physical title is the parent record; individual owned items belong in
-- physical_book_copies and are identified by their unique copy_code.
create or replace function public.prevent_duplicate_physical_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_fields_changed boolean;
begin
  title_fields_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    title_fields_changed := new.title is distinct from old.title
      or new.author is distinct from old.author
      or new.category is distinct from old.category
      or new.catalog_type is distinct from old.catalog_type;
  end if;

  if new.catalog_type in ('physical', 'hybrid') and title_fields_changed then
    perform pg_advisory_xact_lock(hashtextextended(
      lower(regexp_replace(btrim(new.title), '[[:space:]]+', ' ', 'g')) || '|' ||
      lower(regexp_replace(btrim(new.author), '[[:space:]]+', ' ', 'g')) || '|' ||
      lower(regexp_replace(btrim(new.category), '[[:space:]]+', ' ', 'g')),
      0
    ));
  end if;

  if new.catalog_type in ('physical', 'hybrid')
    and title_fields_changed
    and exists (
      select 1
      from public.books existing
      where existing.id <> new.id
        and existing.catalog_type in ('physical', 'hybrid')
        and lower(regexp_replace(btrim(existing.title), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.title), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.author), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.author), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.category), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.category), '[[:space:]]+', ' ', 'g'))
    ) then
    raise exception 'This physical title already exists. Open its title record and add copies; use the copy code to identify each item.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_physical_title on public.books;
create trigger prevent_duplicate_physical_title
before insert or update of title, author, category, catalog_type on public.books
for each row execute function public.prevent_duplicate_physical_title();
revoke all on function public.prevent_duplicate_physical_title() from public, anon, authenticated;

commit;
-- <<< END MIGRATION: 20261052_prevent_duplicate_physical_titles.sql

-- >>> BEGIN MIGRATION: 20261053_remove_faculty_course_assignments.sql
begin;

-- Faculty profiles retain their faculty/department choice. Course programs are
-- member profile data for students only; faculty course assignments are retired.
drop function if exists public.admin_update_member_academics(
  uuid, text, text, text, text, text, bigint, bigint[]
);

create or replace function public.admin_update_member_academics(
  target_user_id uuid,
  new_role text,
  new_school text,
  new_department text,
  new_course text,
  new_student_year text,
  new_faculty_rank_id bigint
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_role is null or new_role not in ('student', 'faculty', 'librarian') then
    raise exception 'Invalid member role';
  end if;
  if char_length(trim(coalesce(new_school, ''))) > 120
    or char_length(trim(coalesce(new_department, ''))) > 120
    or char_length(trim(coalesce(new_course, ''))) > 120
    or char_length(trim(coalesce(new_student_year, ''))) > 40 then
    raise exception 'Profile details exceed the allowed length';
  end if;

  if new_role = 'student' then
    if nullif(trim(coalesce(new_course, '')), '') is null
      or not exists (
        select 1 from public.academic_courses
        where is_active and name = trim(new_course)
      ) then
      raise exception 'Choose an active course program';
    end if;
    if new_student_year is null
      or trim(new_student_year) not in ('1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year') then
      raise exception 'Choose a valid year level';
    end if;
  end if;

  if new_role = 'faculty' then
    if nullif(trim(coalesce(new_department, '')), '') is null
      or not exists (
        select 1 from public.academic_departments
        where is_active and name = trim(new_department)
      ) then
      raise exception 'Choose an active faculty department';
    end if;
    if new_faculty_rank_id is not null and not exists (
      select 1 from public.faculty_ranks where id = new_faculty_rank_id and is_active
    ) then
      raise exception 'Choose an active faculty title';
    end if;
  end if;

  update public.profiles
  set role = new_role,
      school = nullif(trim(coalesce(new_school, '')), ''),
      department = case when new_role = 'faculty' then trim(new_department) else null end,
      course = case when new_role = 'student' then trim(new_course) else null end,
      student_year = case when new_role = 'student' then trim(new_student_year) else null end,
      faculty_rank_id = case when new_role = 'faculty' then new_faculty_rank_id else null end
  where id = target_user_id and role in ('student', 'faculty', 'librarian')
  returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Member profile not found'; end if;
  return updated_profile;
end;
$$;

revoke all on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint)
  from public, anon;
grant execute on function public.admin_update_member_academics(uuid, text, text, text, text, text, bigint)
  to authenticated;

drop table if exists public.faculty_courses;

commit;
-- <<< END MIGRATION: 20261053_remove_faculty_course_assignments.sql

-- >>> BEGIN MIGRATION: 20261054_physical_incident_assessments_and_refunds.sql
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
-- <<< END MIGRATION: 20261054_physical_incident_assessments_and_refunds.sql

-- >>> BEGIN MIGRATION: 20261055_library_assistant_context_and_knowledge.sql
begin;

create extension if not exists vector with schema extensions;

create table if not exists public.library_assistant_settings (
  id boolean primary key default true check (id),
  librarian_name text,
  policy_text text not null default '',
  front_desk_fallback text not null default 'Please contact the library front desk to confirm.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.library_assistant_settings(id, policy_text)
values (true, 'Physical loans are available for 1, 3, 5, 7, 14, or 30 days; each title has its own configured fee. Overdue fines are PHP 5.00 per chargeable day after a 2-calendar-day grace period, excluding Sundays and library holidays, capped at PHP 500 per item. At 30 days overdue an item is classified as lost and late-fine accrual stops. Lost and damage charges are staff assessments, not fixed amounts. An unpaid physical fine balance of PHP 100 or more suspends borrowing privileges. Do not state unverified limits, schedules, names, charges, or locations.')
on conflict (id) do nothing;

alter table public.library_assistant_settings enable row level security;
drop policy if exists library_assistant_settings_read on public.library_assistant_settings;
create policy library_assistant_settings_read on public.library_assistant_settings
  for select to authenticated using (true);
revoke all on public.library_assistant_settings from anon, authenticated;
grant select on public.library_assistant_settings to authenticated;

create or replace function public.admin_update_library_assistant_settings(
  p_librarian_name text, p_policy_text text, p_front_desk_fallback text
) returns public.library_assistant_settings
language plpgsql security definer set search_path = public
as $$
declare saved public.library_assistant_settings;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(coalesce(p_librarian_name, '')) > 160
    or nullif(trim(coalesce(p_policy_text, '')), '') is null or char_length(p_policy_text) > 12000
    or nullif(trim(coalesce(p_front_desk_fallback, '')), '') is null or char_length(p_front_desk_fallback) > 500 then
    raise exception 'Enter a policy, a fallback contact message, and a librarian name no longer than 160 characters';
  end if;
  insert into public.library_assistant_settings(id, librarian_name, policy_text, front_desk_fallback, updated_at, updated_by)
  values (true, nullif(trim(p_librarian_name), ''), trim(p_policy_text), trim(p_front_desk_fallback), now(), auth.uid())
  on conflict (id) do update set librarian_name = excluded.librarian_name,
    policy_text = excluded.policy_text, front_desk_fallback = excluded.front_desk_fallback,
    updated_at = now(), updated_by = auth.uid()
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.admin_update_library_assistant_settings(text, text, text) from public, anon;
grant execute on function public.admin_update_library_assistant_settings(text, text, text) to authenticated;

create or replace function public.assistant_search_physical_inventory(p_query text)
returns table(id bigint, title text, author text, category text, isbn text, available_copies bigint, total_copies bigint, locations text[])
language sql stable security definer set search_path = public
as $$
  select c.id, c.title, c.author, c.category, c.isbn, c.available_copies, c.registered_copies, c.locations
  from public.get_public_physical_catalog() c
  where c.catalog_type in ('physical', 'hybrid') and not exists (
    select 1 from public.books b where b.id = c.id and b.is_archived
  )
  and (nullif(trim(p_query), '') is null or c.title ilike '%' || trim(p_query) || '%'
    or c.author ilike '%' || trim(p_query) || '%' or c.category ilike '%' || trim(p_query) || '%'
    or coalesce(c.isbn, '') ilike '%' || trim(p_query) || '%')
  order by case when lower(c.title) = lower(trim(p_query)) then 0 else 1 end, c.title
  limit 8;
$$;
revoke all on function public.assistant_search_physical_inventory(text) from public, anon;
grant execute on function public.assistant_search_physical_inventory(text) to authenticated;

create table if not exists public.library_assistant_knowledge (
  id bigint generated by default as identity primary key,
  document_title text not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(768) not null,
  updated_at timestamptz not null default now(),
  unique(document_title, chunk_index)
);
create index if not exists library_assistant_knowledge_embedding_idx
  on public.library_assistant_knowledge using hnsw (embedding extensions.vector_cosine_ops);
alter table public.library_assistant_knowledge enable row level security;
revoke all on public.library_assistant_knowledge from public, anon, authenticated;

create or replace function public.match_library_assistant_knowledge(p_embedding extensions.vector(768), p_match_count integer default 5)
returns table(document_title text, content text, similarity real)
language sql stable security definer set search_path = public, extensions
as $$
  select k.document_title, k.content, (1 - (k.embedding <=> p_embedding))::real
  from public.library_assistant_knowledge k
  order by k.embedding <=> p_embedding
  limit least(greatest(coalesce(p_match_count, 5), 1), 8);
$$;
revoke all on function public.match_library_assistant_knowledge(extensions.vector, integer) from public, anon;
grant execute on function public.match_library_assistant_knowledge(extensions.vector, integer) to authenticated;

create or replace function public.admin_replace_library_assistant_knowledge(
  p_document_title text, p_chunks jsonb
) returns integer
language plpgsql security definer set search_path = public
as $$
declare chunk_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(coalesce(p_document_title, '')), '') is null or char_length(p_document_title) > 200
    or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) < 1 or jsonb_array_length(p_chunks) > 100 then
    raise exception 'Provide a document title and 1 to 100 content chunks';
  end if;
  delete from public.library_assistant_knowledge where document_title = trim(p_document_title);
  insert into public.library_assistant_knowledge(document_title, chunk_index, content, embedding)
  select trim(p_document_title), row.chunk_index, row.content, row.embedding::extensions.vector(768)
  from jsonb_to_recordset(p_chunks) as row(chunk_index integer, content text, embedding text)
  where char_length(row.content) between 1 and 4000;
  get diagnostics chunk_count = row_count;
  if chunk_count = 0 then raise exception 'No valid knowledge chunks were supplied'; end if;
  return chunk_count;
end;
$$;
revoke all on function public.admin_replace_library_assistant_knowledge(text, jsonb) from public, anon;
grant execute on function public.admin_replace_library_assistant_knowledge(text, jsonb) to authenticated;

commit;
-- <<< END MIGRATION: 20261055_library_assistant_context_and_knowledge.sql

-- >>> BEGIN MIGRATION: 20261056_immediate_lost_item_assessment.sql
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
-- <<< END MIGRATION: 20261056_immediate_lost_item_assessment.sql

-- >>> BEGIN MIGRATION: 20261057_retire_print_payment_entry.sql

-- <<< END MIGRATION: 20261057_retire_print_payment_entry.sql

-- >>> BEGIN MIGRATION: 20261058_admin_points_cap_and_book_metadata.sql
alter table public.books add column if not exists course_code text;
alter table public.books add column if not exists source_type text;

update public.books
set source_type = 'catalog'
where source_type is null;

update public.books
set category = 'Uncategorized',
    source_type = 'community_contribution'
where lower(trim(category)) = 'community contribution';

update public.books
set course_code = trim(category),
    category = 'Uncategorized'
where course_code is null
  and trim(category) ~* '^[a-z]{2,6}[- ]?[0-9]{2,4}[a-z]?$';

alter table public.books alter column source_type set default 'staff_added';
alter table public.books alter column source_type set not null;
alter table public.books drop constraint if exists books_source_type_check;
alter table public.books add constraint books_source_type_check
  check (source_type in ('catalog', 'staff_added', 'community_contribution'));
alter table public.books drop constraint if exists books_course_code_check;
alter table public.books add constraint books_course_code_check
  check (course_code is null or char_length(trim(course_code)) between 1 and 32);

create or replace function public.normalize_book_metadata_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(trim(new.category)) = 'community contribution' then
    new.category := 'Uncategorized';
    new.source_type := 'community_contribution';
  elsif trim(new.category) ~* '^[a-z]{2,6}[- ]?[0-9]{2,4}[a-z]?$' then
    new.course_code := coalesce(nullif(trim(new.course_code), ''), trim(new.category));
    new.category := 'Uncategorized';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_book_metadata_fields on public.books;
create trigger trg_normalize_book_metadata_fields
before insert or update of category, course_code, source_type
on public.books
for each row execute function public.normalize_book_metadata_fields();
revoke all on function public.normalize_book_metadata_fields() from public, anon, authenticated;

create or replace function public.admin_award_recognition(
  target_user_id uuid,
  award_category text,
  award_points integer,
  award_reason text
)
returns public.recognition_awards
language plpgsql
security definer
set search_path = public
as $$
declare
  new_award public.recognition_awards;
  daily_awarded bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if award_points <= 0 then raise exception 'Award points must be positive'; end if;
  if nullif(trim(award_reason), '') is null then raise exception 'Award reason is required'; end if;

  perform pg_advisory_xact_lock(hashtext('admin_daily_points'), hashtext(auth.uid()::text));
  select coalesce(sum(points), 0)
    into daily_awarded
    from public.recognition_awards
    where awarded_by = auth.uid()
      and created_at >= date_trunc('day', now())
      and created_at < date_trunc('day', now()) + interval '1 day';

  if daily_awarded + award_points > 1000 then
    raise exception 'Daily points grant limit of 1,000 points reached';
  end if;

  insert into public.recognition_awards(student_id, category, points, reason, awarded_by)
  values (target_user_id, award_category, award_points, trim(award_reason), auth.uid())
  returning * into new_award;
  update public.profiles set points_balance = points_balance + award_points where id = target_user_id;
  insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
  values (target_user_id, award_points, 'admin_adjustment', new_award.id, 'Recognition award: ' || trim(award_category));
  insert into public.audit_logs(actor_id, action, target_type, details)
  values (
    auth.uid(),
    'recognition_awarded',
    'profile',
    jsonb_build_object(
      'target_user_id', target_user_id,
      'points', award_points,
      'category', trim(award_category),
      'reason', trim(award_reason),
      'daily_cap', 1000
    )
  );
  return new_award;
end;
$$;

revoke all on function public.admin_award_recognition(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_award_recognition(uuid, text, integer, text) to authenticated;
-- <<< END MIGRATION: 20261058_admin_points_cap_and_book_metadata.sql

-- >>> BEGIN MIGRATION: 20261059_desk_identity_fines_and_review_controls.sql
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
create or replace function public.admin_waive_physical_fine(
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
-- <<< END MIGRATION: 20261059_desk_identity_fines_and_review_controls.sql

-- >>> BEGIN MIGRATION: 20261060_physical_loan_renewals.sql
begin;

create table if not exists public.physical_book_renewals (
  id bigint generated by default as identity primary key,
  request_id bigint not null references public.physical_book_requests(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  copy_id bigint not null references public.physical_book_copies(id) on delete restrict,
  renewed_by uuid references public.profiles(id) on delete set null,
  duration_days integer not null check (duration_days between 1 and 365),
  previous_due_date timestamptz not null,
  new_due_date timestamptz not null,
  fee_amount numeric(10, 2) not null check (fee_amount >= 0),
  amount_received numeric(10, 2) not null check (amount_received >= 0),
  payment_notes text,
  receipt_number text not null unique,
  id_card_presented boolean not null check (id_card_presented),
  created_at timestamptz not null default now()
);

create index if not exists idx_physical_book_renewals_request
  on public.physical_book_renewals(request_id, created_at desc);
create index if not exists idx_physical_book_renewals_student
  on public.physical_book_renewals(student_id, created_at desc);

alter table public.physical_book_renewals enable row level security;
drop policy if exists physical_book_renewals_read_own_or_staff on public.physical_book_renewals;
create policy physical_book_renewals_read_own_or_staff
  on public.physical_book_renewals for select to authenticated
  using (student_id = auth.uid() or public.is_library_staff());
revoke insert, update, delete on public.physical_book_renewals from public, anon, authenticated;
grant select on public.physical_book_renewals to authenticated;

create or replace function public.admin_renew_physical_loan(
  p_request_id bigint,
  p_duration_days integer,
  p_amount_paid numeric,
  p_payment_notes text,
  p_id_card_presented boolean
) returns public.physical_book_renewals
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.physical_book_requests;
  selected_option public.physical_loan_options;
  saved_renewal public.physical_book_renewals;
  renewal_time timestamptz := now();
  previous_due_date timestamptz;
  next_due_date timestamptz;
begin
  if not public.is_library_staff() then raise exception 'Librarian or administrator access required'; end if;
  if p_id_card_presented is distinct from true then
    raise exception 'Confirm that the member presented a physical institutional ID card';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Enter a valid amount received'; end if;
  if char_length(coalesce(p_payment_notes, '')) > 500 then raise exception 'Payment notes are limited to 500 characters'; end if;

  perform public.calculate_overdue_fines();
  select * into target_request
  from public.physical_book_requests
  where id = p_request_id
  for update;
  if target_request.id is null or target_request.status <> 'checked_out' then
    raise exception 'Only an active checked-out loan can be renewed';
  end if;
  if target_request.copy_id is null or target_request.due_date is null then
    raise exception 'The active loan is missing its copy or due date';
  end if;
  if target_request.due_date <= renewal_time then raise exception 'Overdue loans cannot be renewed'; end if;
  if target_request.incident_type is not null
    and coalesce(target_request.incident_status, 'open') = 'open' then
    raise exception 'Loans with an open incident cannot be renewed';
  end if;
  if exists (
    select 1
    from public.physical_book_requests r
    where r.student_id = target_request.student_id
      and (
        r.status = 'lost'
        or (r.status in ('checked_out', 'return_pending') and r.due_date <= renewal_time)
      )
  ) then
    raise exception 'Resolve overdue or lost physical loans before renewing';
  end if;
  if coalesce((
    select sum(f.amount)
    from public.fines f
    where f.student_id = target_request.student_id and f.status = 'unpaid'
  ), 0) > 100 then
    raise exception 'Unpaid fines above PHP 100 block physical borrowing and renewals';
  end if;

  select * into selected_option
  from public.physical_loan_options
  where book_id = target_request.book_id
    and duration_days = p_duration_days
    and is_active
  for share;
  if selected_option.id is null then raise exception 'Choose an active renewal period and fee'; end if;
  if round(p_amount_paid, 2) <> round(selected_option.fee_amount, 2) then
    raise exception 'Amount received must equal the configured fee for the selected renewal period';
  end if;

  previous_due_date := target_request.due_date;
  next_due_date := renewal_time + make_interval(days => selected_option.duration_days);
  update public.physical_book_copies
  set due_date = next_due_date
  where id = target_request.copy_id and status = 'borrowed';
  if not found then raise exception 'The physical copy is no longer checked out'; end if;

  update public.physical_book_requests
  set due_date = next_due_date
  where id = target_request.id
  returning * into target_request;
  update public.physical_book_loan_history
  set due_date = next_due_date, updated_at = renewal_time
  where request_id = target_request.id;

  insert into public.physical_book_renewals(
    request_id, student_id, copy_id, renewed_by, duration_days,
    previous_due_date, new_due_date, fee_amount, amount_received,
    payment_notes, receipt_number, id_card_presented, created_at
  ) values (
    target_request.id, target_request.student_id, target_request.copy_id, auth.uid(),
    selected_option.duration_days, previous_due_date,
    next_due_date, selected_option.fee_amount, round(p_amount_paid, 2),
    nullif(trim(coalesce(p_payment_notes, '')), ''),
    'SL-R-' || to_char(renewal_time, 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    true, renewal_time
  ) returning * into saved_renewal;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_loan_renewed', 'physical_book_request', target_request.id,
    jsonb_build_object(
      'student_id', target_request.student_id,
      'copy_id', target_request.copy_id,
      'duration_days', selected_option.duration_days,
      'fee_amount', selected_option.fee_amount,
      'amount_received', round(p_amount_paid, 2),
      'previous_due_date', saved_renewal.previous_due_date,
      'new_due_date', next_due_date,
      'receipt_number', saved_renewal.receipt_number,
      'id_card_presented', true
    ));
  return saved_renewal;
end;
$$;

revoke all on function public.admin_renew_physical_loan(bigint, integer, numeric, text, boolean)
  from public, anon;
grant execute on function public.admin_renew_physical_loan(bigint, integer, numeric, text, boolean)
  to authenticated;

commit;
-- <<< END MIGRATION: 20261060_physical_loan_renewals.sql

-- >>> BEGIN MIGRATION: 20261061_trusted_profile_role_provisioning.sql
begin;

-- User metadata is client-controlled; elevated roles are assigned only by
-- the authenticated administrator workflow after an invitation is created.
create or replace function public.provision_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), 'student')
  on conflict (id) do update set email = excluded.email;

  update public.profiles
  set first_name = nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
      middle_name = nullif(trim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), ''),
      last_name = nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
      full_name = coalesce(
        nullif(trim(concat_ws(' ',
          nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
          nullif(trim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), ''),
          nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '')
        )), ''),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
      ),
      school = nullif(trim(coalesce(new.raw_user_meta_data ->> 'school', '')), ''),
      department = nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), ''),
      course = nullif(trim(coalesce(new.raw_user_meta_data ->> 'course', '')), ''),
      student_year = nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_year', '')), '')
  where id = new.id;

  return new;
end;
$$;

commit;
-- <<< END MIGRATION: 20261061_trusted_profile_role_provisioning.sql

-- >>> BEGIN MIGRATION: 20261062_serialize_duplicate_physical_requests.sql
begin;

do $$
begin
  if to_regprocedure('public.request_physical_book_without_duplicate_race(bigint, bigint, integer, text, text, text)') is null then
    alter function public.request_physical_book(bigint, bigint, integer, text, text, text)
      rename to request_physical_book_without_duplicate_race;
  end if;

  if to_regprocedure('public.request_physical_book(bigint, bigint, integer, text, text, text)') is null then
    execute $function$
      create function public.request_physical_book(
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
      as $body$
      declare
        current_user_id uuid := auth.uid();
      begin
        if current_user_id is null then raise exception 'Sign in to request a physical book'; end if;
        perform pg_advisory_xact_lock(hashtextextended(
          'physical-request:' || current_user_id::text || ':' || p_book_id::text, 0
        ));
        return public.request_physical_book_without_duplicate_race(
          p_book_id, p_copy_id, p_duration_days, p_payment_method, p_transaction_reference, p_payment_proof_path
        );
      end;
      $body$;
    $function$;
  end if;
end;
$$;

revoke all on function public.request_physical_book_without_duplicate_race(bigint, bigint, integer, text, text, text)
  from public, anon, authenticated;

revoke all on function public.request_physical_book(bigint, bigint, integer, text, text, text) from public, anon;
grant execute on function public.request_physical_book(bigint, bigint, integer, text, text, text) to authenticated;

commit;
-- <<< END MIGRATION: 20261062_serialize_duplicate_physical_requests.sql

-- >>> BEGIN MIGRATION: 20261063_librarian_member_directory_read.sql
begin;

create or replace function public.is_librarian()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'librarian'
  );
$$;

revoke all on function public.is_librarian() from public, anon;
grant execute on function public.is_librarian() to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (role in ('student', 'faculty') and public.is_librarian())
);

commit;
-- <<< END MIGRATION: 20261063_librarian_member_directory_read.sql

-- >>> BEGIN MIGRATION: 20261064_librarian_only_circulation_actions.sql
begin;

do $$
declare
  routine record;
  routine_name text;
  routine_count integer;
  definition text;
  restricted_definition text;
begin
  foreach routine_name in array array[
    'admin_confirm_physical_checkout',
    'admin_close_physical_loan',
    'admin_decide_physical_request',
    'admin_inspect_physical_return',
    'admin_renew_physical_loan',
    'admin_resolve_lost_physical_loan',
    'admin_assess_physical_incident',
    'admin_resolve_physical_damage_case'
  ]
  loop
    routine_count := 0;
    for routine in
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = routine_name
        and p.prokind = 'f'
    loop
      routine_count := routine_count + 1;
      definition := pg_get_functiondef(routine.oid);
      restricted_definition := regexp_replace(
        definition,
        'if not public\.(is_admin|is_library_staff)\(\)[[:space:]]+then[[:space:]]+raise exception ''[^'']+'';[[:space:]]+end if;',
        'if not public.is_librarian() then raise exception ''Librarian access required''; end if;',
        'g'
      );

      if restricted_definition <> definition then
        execute restricted_definition;
      elsif position('if not public.is_librarian() then' in definition) = 0 then
        raise exception 'Could not verify librarian-only authorization for public.%', routine_name;
      end if;
    end loop;

    if routine_count = 0 then
      raise exception 'Expected physical circulation routine public.% was not found', routine_name;
    end if;
  end loop;
end;
$$;

commit;
-- <<< END MIGRATION: 20261064_librarian_only_circulation_actions.sql

-- >>> BEGIN MIGRATION: 20261106_librarian_scan_to_issue.sql
begin;

create or replace function public.notify_staff_of_physical_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' then return new; end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id, 'physical_request_created', 'New physical-book request',
    'A member submitted a physical-book request that needs payment and checkout review.', new.id
  from public.profiles p
  where p.role in ('admin', 'librarian');
  return new;
end;
$$;

do $$
declare
  definition text;
  updated_definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enforce_library_borrowing_policy'
    and p.prorettype = 'pg_catalog.trigger'::regtype;
  if definition is null then raise exception 'Physical borrowing policy trigger was not found'; end if;

  updated_definition := replace(definition,
    'member_id <> auth.uid() and not public.is_admin()',
    'member_id <> auth.uid() and not public.is_admin() and not (tg_table_name = ''physical_book_requests'' and public.is_librarian())');
  if updated_definition = definition then
    raise exception 'Could not verify librarian borrowing authorization; inspect the borrowing policy trigger before applying';
  end if;
  execute updated_definition;
end;
$$;

do $$
declare
  definition text;
  updated_definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_renew_physical_loan'
    and p.proargtypes = '20 23 1700 25 16'::oidvector;

  if definition is null then
    raise exception 'Expected librarian renewal RPC was not found';
  end if;

  updated_definition := regexp_replace(definition,
    '>\s*100([.]0+)?\s+then',
    '> 0 then',
    'g');
  updated_definition := replace(updated_definition,
    'Unpaid fines above PHP 100 block physical borrowing and renewals',
    'Clear all unpaid physical fines before renewing');

  if position('sum(f.amount)' in lower(updated_definition)) = 0
    or updated_definition !~* '>\s*0([.]0+)?\s+then' then
    raise exception 'Could not verify the physical renewal fine hold; inspect public.admin_renew_physical_loan before applying';
  end if;
  if updated_definition <> definition then
    execute updated_definition;
  end if;
end;
$$;

create or replace function public.admin_issue_physical_copy(
  p_student_id uuid,
  p_copy_code text,
  p_duration_days integer,
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
  target_profile public.profiles;
  target_copy public.physical_book_copies;
  target_book public.books;
  target_option public.physical_loan_options;
  saved_request public.physical_book_requests;
  checked_out_at_time timestamptz := now();
  unpaid_total numeric(10, 2);
  active_physical_count integer;
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

  perform pg_advisory_xact_lock(hashtextextended('physical-member:' || p_student_id::text, 0));
  perform public.calculate_overdue_fines();

  select * into target_profile
  from public.profiles
  where id = p_student_id and role in ('student', 'faculty');
  if target_profile.id is null then raise exception 'Choose an active student or faculty member'; end if;

  select * into target_copy
  from public.physical_book_copies
  where lower(copy_code) = lower(trim(p_copy_code))
  for update;
  if target_copy.id is null then raise exception 'No physical copy matches that accession tag'; end if;
  if target_copy.status <> 'available' then
    raise exception 'Copy % is %, not available for checkout', target_copy.copy_code, target_copy.status;
  end if;

  select * into target_book
  from public.books
  where id = target_copy.book_id
    and catalog_type in ('physical', 'hybrid')
    and not is_archived;
  if target_book.id is null then raise exception 'This title is not available for circulation'; end if;

  select * into target_option
  from public.physical_loan_options
  where book_id = target_copy.book_id
    and duration_days = p_duration_days
    and is_active
  for share;
  if target_option.id is null then raise exception 'Choose an active loan period configured for this title'; end if;
  if round(p_amount_paid, 2) <> round(target_option.fee_amount, 2) then
    raise exception 'Amount received must equal the configured loan fee';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = p_student_id
      and (
        status = 'lost'
        or (status in ('checked_out', 'return_pending') and due_date < checked_out_at_time)
      )
  ) then
    raise exception 'Resolve overdue or lost physical loans before issuing another book';
  end if;

  select coalesce(sum(amount), 0) into unpaid_total
  from public.fines
  where student_id = p_student_id
    and physical_book_request_id is not null
    and status = 'unpaid';
  if unpaid_total > 0 then raise exception 'Clear all unpaid physical fines before issuing another book'; end if;

  select count(*)::integer into active_physical_count
  from public.physical_book_requests
  where student_id = p_student_id
    and status in ('checked_out', 'return_pending');
  if active_physical_count >= 3 then
    raise exception 'The physical borrowing limit of 3 active books has been reached';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = p_student_id
      and book_id = target_copy.book_id
      and status in ('pending', 'checked_out', 'return_pending')
  ) then
    raise exception 'This member already has a pending request or active loan for this title';
  end if;

  update public.physical_book_copies
  set status = 'borrowed',
      checked_out_at = checked_out_at_time,
      due_date = checked_out_at_time + make_interval(days => target_option.duration_days)
  where id = target_copy.id;

  insert into public.physical_book_requests (
    student_id, book_id, loan_option_id, copy_id, duration_days, fee_amount,
    payment_method, payment_status, status, checked_out_at, due_date,
    payment_received_amount, payment_verified_at, payment_verified_by, payment_notes
  ) values (
    p_student_id, target_copy.book_id, target_option.id, target_copy.id,
    target_option.duration_days, target_option.fee_amount, 'cash', 'paid', 'checked_out',
    checked_out_at_time, checked_out_at_time + make_interval(days => target_option.duration_days),
    round(p_amount_paid, 2), checked_out_at_time, auth.uid(),
    nullif(trim(coalesce(p_payment_notes, '')), '')
  ) returning * into saved_request;

  update public.physical_book_requests
  set receipt_number = 'SL-' || to_char(checked_out_at_time, 'YYYYMMDD') || '-' || lpad(saved_request.id::text, 6, '0')
  where id = saved_request.id
  returning * into saved_request;

  insert into public.physical_book_loan_history (
    request_id, student_id, book_id, copy_id, duration_days, fee_amount,
    payment_method, payment_status, checked_out_at, due_date, status,
    receipt_number, checked_out_by, notes
  ) values (
    saved_request.id, saved_request.student_id, saved_request.book_id, saved_request.copy_id,
    saved_request.duration_days, saved_request.fee_amount, saved_request.payment_method,
    saved_request.payment_status, saved_request.checked_out_at, saved_request.due_date,
    'checked_out', saved_request.receipt_number, auth.uid(), saved_request.payment_notes
  );

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'physical_checkout_issued_by_librarian', 'physical_book_request', saved_request.id,
    jsonb_build_object(
      'student_id', p_student_id,
      'copy_id', target_copy.id,
      'copy_code', target_copy.copy_code,
      'duration_days', target_option.duration_days,
      'fee_amount', target_option.fee_amount,
      'amount_received', round(p_amount_paid, 2),
      'id_card_presented', true
    ));

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (p_student_id, 'physical_checkout', 'Physical book checked out',
    'Your physical-book checkout is complete. Your receipt is available in your library account.',
    saved_request.id);
  return saved_request;
end;
$$;

revoke all on function public.admin_issue_physical_copy(uuid, text, integer, numeric, text, boolean)
  from public, anon;
grant execute on function public.admin_issue_physical_copy(uuid, text, integer, numeric, text, boolean)
  to authenticated;

create or replace function public.admin_return_physical_loans(
  p_student_id uuid,
  p_request_ids bigint[],
  p_id_card_presented boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request record;
  returned_count integer := 0;
begin
  if not public.is_librarian() then raise exception 'Librarian access required'; end if;
  if p_id_card_presented is distinct from true then
    raise exception 'Confirm that the member presented a physical institutional ID card';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) < 1 or cardinality(p_request_ids) > 10 then
    raise exception 'Select between 1 and 10 physical loans to return';
  end if;
  if cardinality(p_request_ids) <> (select count(distinct request_id) from unnest(p_request_ids) as items(request_id)) then
    raise exception 'A physical loan can only be selected once';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('physical-member:' || p_student_id::text, 0));

  for target_request in
    select r.id
    from public.physical_book_requests r
    where r.id = any(p_request_ids)
      and r.student_id = p_student_id
      and r.status in ('checked_out', 'return_pending')
      and r.copy_id is not null
    order by r.id
    for update
  loop
    perform public.admin_inspect_physical_return(target_request.id, 'available', 0, null, true);
    returned_count := returned_count + 1;
  end loop;

  if returned_count <> cardinality(p_request_ids) then
    raise exception 'One or more selected copies are not active loans for this member';
  end if;
  return returned_count;
end;
$$;

revoke all on function public.admin_return_physical_loans(uuid, bigint[], boolean)
  from public, anon;
grant execute on function public.admin_return_physical_loans(uuid, bigint[], boolean)
  to authenticated;

commit;
-- <<< END MIGRATION: 20261106_librarian_scan_to_issue.sql

-- >>> BEGIN MIGRATION: 20261107_cash_only_physical_payments.sql
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
-- <<< END MIGRATION: 20261107_cash_only_physical_payments.sql

-- >>> BEGIN MIGRATION: 20261108_cash_point_topups_and_staff_enrollment.sql
begin;

alter table public.point_transactions
  drop constraint if exists point_transactions_transaction_type_check;
alter table public.point_transactions
  add constraint point_transactions_transaction_type_check
  check (transaction_type in (
    'contribution_reward',
    'contribution_royalty',
    'access_unlock',
    'admin_adjustment',
    'cash_topup'
  ));

create table if not exists public.point_topups (
  id bigint generated by default as identity primary key,
  member_id uuid not null references public.profiles(id) on delete restrict,
  bundle_points integer not null check (bundle_points in (200, 500, 1000)),
  amount_paid numeric(8, 2) not null check (amount_paid in (10, 22, 40)),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  receipt_number text unique,
  created_at timestamptz not null default now(),
  check (
    (bundle_points = 200 and amount_paid = 10)
    or (bundle_points = 500 and amount_paid = 22)
    or (bundle_points = 1000 and amount_paid = 40)
  )
);

create index if not exists point_topups_member_created_idx
  on public.point_topups(member_id, created_at desc);
alter table public.point_topups enable row level security;
drop policy if exists point_topups_read_own_or_staff on public.point_topups;
create policy point_topups_read_own_or_staff on public.point_topups
  for select to authenticated
  using (member_id = auth.uid() or public.is_library_staff());
revoke all on public.point_topups from public, anon, authenticated;
grant select on public.point_topups to authenticated;

create or replace function public.staff_record_cash_point_topup(
  p_member_id uuid,
  p_bundle_points integer
)
returns public.point_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
  amount_to_pay numeric(8, 2);
  saved_topup public.point_topups;
begin
  if auth.uid() is null or not public.is_library_staff() then
    raise exception 'Librarian or administrator access required';
  end if;

  amount_to_pay := case p_bundle_points
    when 200 then 10
    when 500 then 22
    when 1000 then 40
    else null
  end;
  if amount_to_pay is null then
    raise exception 'Choose one of the published 200, 500, or 1,000 point bundles';
  end if;

  select role into member_role
  from public.profiles
  where id = p_member_id
  for update;
  if member_role is null or member_role not in ('student', 'faculty') then
    raise exception 'Point top-ups are available only to student and faculty members';
  end if;

  insert into public.point_topups(member_id, bundle_points, amount_paid, recorded_by)
  values (p_member_id, p_bundle_points, amount_to_pay, auth.uid())
  returning * into saved_topup;

  update public.point_topups
  set receipt_number = 'SL-PT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(saved_topup.id::text, 6, '0')
  where id = saved_topup.id
  returning * into saved_topup;

  update public.profiles
  set points_balance = points_balance + p_bundle_points
  where id = p_member_id;

  insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
  values (
    p_member_id,
    p_bundle_points,
    'cash_topup',
    saved_topup.id,
    format('Cash top-up: %s points for PHP %s (Receipt %s)',
      p_bundle_points, to_char(amount_to_pay, 'FM999999990.00'), saved_topup.receipt_number)
  );

  insert into public.audit_logs(actor_id, action, target_type, details)
  values (
    auth.uid(),
    'cash_point_topup_recorded',
    'profile',
    jsonb_build_object(
      'target_user_id', p_member_id,
      'topup_id', saved_topup.id,
      'points', p_bundle_points,
      'amount_paid_php', amount_to_pay,
      'receipt_number', saved_topup.receipt_number
    )
  );

  return saved_topup;
end;
$$;

revoke all on function public.staff_record_cash_point_topup(uuid, integer) from public, anon;
grant execute on function public.staff_record_cash_point_topup(uuid, integer) to authenticated;

revoke all on function public.admin_award_recognition(uuid, text, integer, text) from public, anon, authenticated;

create or replace function public.prevent_student_non_topup_point_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if new.amount > 0 and new.transaction_type <> 'cash_topup' then
    select role into target_role from public.profiles where id = new.user_id;
    if target_role = 'student' then
      raise exception 'Student points can be added only through a staff-recorded cash top-up';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_student_non_topup_point_income on public.point_transactions;
create trigger prevent_student_non_topup_point_income
before insert on public.point_transactions
for each row execute function public.prevent_student_non_topup_point_income();
revoke all on function public.prevent_student_non_topup_point_income() from public, anon, authenticated;

commit;
-- <<< END MIGRATION: 20261108_cash_point_topups_and_staff_enrollment.sql

-- >>> BEGIN MIGRATION: 20261108120000_library_policy_and_audit.sql
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
-- <<< END MIGRATION: 20261108120000_library_policy_and_audit.sql

-- >>> BEGIN MIGRATION: 20261108205023_require_exact_copy_for_pending_checkout.sql
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
-- <<< END MIGRATION: 20261108205023_require_exact_copy_for_pending_checkout.sql

-- >>> BEGIN MIGRATION: 20261109_faculty_lesson_submissions.sql
begin;

alter table public.book_contributions
  add column if not exists material_type text not null default 'lesson';

-- This one-time backfill runs without an authenticated faculty user.
drop trigger if exists trg_faculty_contributions_only on public.book_contributions;
update public.book_contributions
set material_type = 'legacy_book'
where approved_book_id is not null;
create trigger trg_faculty_contributions_only
before insert or update on public.book_contributions
for each row execute function public.guard_faculty_contributions();

alter table public.book_contributions
  drop constraint if exists book_contributions_material_type_check;
alter table public.book_contributions
  add constraint book_contributions_material_type_check
  check (material_type in ('lesson', 'legacy_book'));
create index if not exists book_contributions_public_lessons_idx
  on public.book_contributions(status, created_at desc)
  where material_type = 'lesson';

drop policy if exists book_contributions_read_own_or_admin on public.book_contributions;
create policy book_contributions_read_own_or_admin on public.book_contributions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_library_staff()
    or (status = 'approved' and material_type = 'lesson')
  );

drop function if exists public.admin_review_book_contribution(bigint, text, integer, integer);
create or replace function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0,
  rejection_reason text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  owner_path text;
  reason text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid lesson review decision'; end if;
  if reward_points is null or reward_points < 0 or reward_points > 100 then raise exception 'Lesson reward must be between 0 and 100 points'; end if;
  if access_points is distinct from 0 then raise exception 'Faculty lessons do not create books or have a points access cost'; end if;
  if decision = 'rejected'
    and (rejection_reason is null or rejection_reason not in ('Poor Scan Quality', 'Copyright Violation', 'Incorrect Metadata')) then
    raise exception 'Choose a supported rejection reason';
  end if;
  reason := case when decision = 'rejected' then rejection_reason else null end;

  select * into contribution
  from public.book_contributions
  where id = contribution_id
  for update;
  if contribution.id is null or contribution.status <> 'pending' then
    raise exception 'Pending lesson submission not found';
  end if;
  if contribution.material_type <> 'lesson' then
    raise exception 'Only lesson submissions can be reviewed here; books must be added by an administrator';
  end if;

  if decision = 'approved' then
    owner_path := 'contributions/' || contribution.user_id::text || '/';
    if contribution.storage_provider = 'google_drive' then
      if nullif(trim(contribution.storage_file_id), '') is null then
        raise exception 'Lesson file is missing its file ID';
      end if;
    elsif contribution.storage_provider is distinct from 'supabase'
      or nullif(trim(contribution.storage_path), '') is null
      or (
        contribution.storage_path not like owner_path || '%'
        and contribution.storage_path not like 'ebooks/' || owner_path || '%'
      )
      or regexp_replace(contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
      or nullif(trim(contribution.pdf_url), '') is distinct from nullif(trim(contribution.storage_path), '') then
      raise exception 'Lesson file must be in the submitter private storage folder before approval';
    end if;

    update public.profiles
    set points_balance = points_balance + reward_points
    where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved faculty lesson');
    end if;
  end if;

  update public.book_contributions
  set status = decision,
      points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = null,
      material_type = 'lesson',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = reason,
      review_feedback = reason
  where id = contribution.id
  returning * into contribution;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (
    contribution.user_id,
    'contribution_review',
    case when decision = 'approved' then 'Lesson approved' else 'Lesson reviewed' end,
    case when decision = 'approved'
      then 'Your lesson is approved and available in the library. ' || reward_points::text || ' points were awarded.'
      else 'Your lesson was not approved: ' || reason || '.' end,
    contribution.id
  );

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    case when decision = 'approved' then 'faculty_lesson_approved' else 'faculty_lesson_rejected' end,
    'book_contribution',
    contribution.id,
    jsonb_build_object('decision', decision, 'points_awarded', contribution.points_awarded, 'reason', reason)
  );

  return contribution;
end;
$$;
revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer, text) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer, text) to authenticated;

commit;
-- <<< END MIGRATION: 20261109_faculty_lesson_submissions.sql

-- >>> BEGIN MIGRATION: 20261110_faculty_contribution_office_formats.sql
begin;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/epub+zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'ebooks';

commit;
-- <<< END MIGRATION: 20261110_faculty_contribution_office_formats.sql

-- >>> BEGIN MIGRATION: 20261111_seed_program_departments.sql
begin;

-- Make every active academic program available as a faculty department choice.
insert into public.academic_departments (name, is_active)
select name, true
from public.academic_courses
where is_active
on conflict (lower(name)) do update
set is_active = excluded.is_active;

commit;
-- <<< END MIGRATION: 20261111_seed_program_departments.sql
