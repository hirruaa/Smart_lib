-- Prevent browser clients from changing protected profile fields.
-- Run this once for an existing Supabase project.

create or replace function public.prevent_student_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    if old.role is distinct from new.role then
      raise exception 'Only an administrator can change account roles';
    end if;
    if old.points_balance is distinct from new.points_balance then
      raise exception 'Only an administrator or approved workflow can change points';
    end if;
    if old.email is distinct from new.email then
      raise exception 'Email changes must be handled by account authentication';
    end if;
  end if;
  return new;
end;
$$;

