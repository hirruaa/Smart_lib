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
