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

-- Public Auth sign-up is closed. Accounts can only be provisioned through the
-- server-side Supabase Auth Admin API, which runs with the service_role claim.
create or replace function public.reject_public_account_registration()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Public account registration is disabled. Contact the college administrator.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_public_account_registration on auth.users;
create trigger trg_reject_public_account_registration
before insert on auth.users
for each row execute function public.reject_public_account_registration();

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
