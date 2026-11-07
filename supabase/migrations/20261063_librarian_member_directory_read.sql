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
