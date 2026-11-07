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
