begin;

create or replace function public.assistant_current_librarians()
returns table(full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)), '')
  )
  from public.profiles as p
  where auth.uid() is not null
    and p.role = 'librarian'
    and coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)), '')
    ) is not null
  order by lower(coalesce(p.full_name, concat_ws(' ', p.first_name, p.middle_name, p.last_name)));
$$;

revoke all on function public.assistant_current_librarians() from public, anon;
grant execute on function public.assistant_current_librarians() to authenticated;

commit;
