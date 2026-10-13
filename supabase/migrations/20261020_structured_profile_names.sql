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

