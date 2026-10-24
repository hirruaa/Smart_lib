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
