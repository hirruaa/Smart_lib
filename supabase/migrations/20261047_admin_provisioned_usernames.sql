begin;

-- Usernames are a sign-in alias. Supabase Auth continues to own passwords,
-- sessions, recovery, and account security. Existing records receive a
-- stable username based on their email prefix (with an ID suffix on collision).
alter table public.profiles add column if not exists username text;

do $$
declare
  member record;
  base_name text;
  candidate text;
  suffix integer;
begin
  for member in
    select id, email from public.profiles where username is null order by id
  loop
    base_name := regexp_replace(lower(split_part(coalesce(member.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g');
    if length(base_name) < 3 then base_name := 'member'; end if;
    candidate := left(base_name, 30);
    suffix := 0;
    while exists (select 1 from public.profiles p where lower(p.username) = candidate) loop
      suffix := suffix + 1;
      candidate := left(base_name, 23) || '-' || substr(member.id::text, 1, 6);
      if suffix > 1 then candidate := left(candidate, 26) || suffix::text; end if;
    end loop;
    update public.profiles set username = candidate where id = member.id;
  end loop;
end;
$$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username)) where username is not null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

commit;
