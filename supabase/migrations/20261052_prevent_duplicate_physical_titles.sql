begin;

-- A physical title is the parent record; individual owned items belong in
-- physical_book_copies and are identified by their unique copy_code.
create or replace function public.prevent_duplicate_physical_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_fields_changed boolean;
begin
  title_fields_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    title_fields_changed := new.title is distinct from old.title
      or new.author is distinct from old.author
      or new.category is distinct from old.category
      or new.catalog_type is distinct from old.catalog_type;
  end if;

  if new.catalog_type in ('physical', 'hybrid') and title_fields_changed then
    perform pg_advisory_xact_lock(hashtextextended(
      lower(regexp_replace(btrim(new.title), '[[:space:]]+', ' ', 'g')) || '|' ||
      lower(regexp_replace(btrim(new.author), '[[:space:]]+', ' ', 'g')) || '|' ||
      lower(regexp_replace(btrim(new.category), '[[:space:]]+', ' ', 'g')),
      0
    ));
  end if;

  if new.catalog_type in ('physical', 'hybrid')
    and title_fields_changed
    and exists (
      select 1
      from public.books existing
      where existing.id <> new.id
        and existing.catalog_type in ('physical', 'hybrid')
        and lower(regexp_replace(btrim(existing.title), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.title), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.author), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.author), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.category), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(new.category), '[[:space:]]+', ' ', 'g'))
    ) then
    raise exception 'This physical title already exists. Open its title record and add copies; use the copy code to identify each item.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_physical_title on public.books;
create trigger prevent_duplicate_physical_title
before insert or update of title, author, category, catalog_type on public.books
for each row execute function public.prevent_duplicate_physical_title();
revoke all on function public.prevent_duplicate_physical_title() from public, anon, authenticated;

commit;
