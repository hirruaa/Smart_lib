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
