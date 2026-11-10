begin;

alter table public.profiles
  drop constraint if exists profiles_institutional_id_format;

create or replace function public.validate_institutional_id_digits_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.institutional_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.institutional_id is not distinct from old.institutional_id then
    return new;
  end if;

  if new.institutional_id !~ '^[0-9]{5,8}$' then
    raise exception 'Institutional ID must contain 5 to 8 digits only';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_validate_institutional_id on public.profiles;
create trigger profiles_validate_institutional_id
before insert or update of institutional_id on public.profiles
for each row execute function public.validate_institutional_id_digits_only();

create or replace function public.admin_update_member_academics(
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
  if new_role in ('student', 'faculty') and coalesce(new_institutional_id, '') !~ '^[0-9]{5,8}$' then
    raise exception 'Institutional ID must contain 5 to 8 digits only';
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
