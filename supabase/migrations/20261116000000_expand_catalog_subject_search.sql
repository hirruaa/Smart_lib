begin;

create or replace function public.sync_book_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector := to_tsvector(
    'english',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.author, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.category, '') || ' ' ||
    coalesce(new.discipline, '') || ' ' ||
    coalesce(new.genre, '') || ' ' ||
    coalesce(new.course_code, '')
  );
  return new;
end;
$$;

update public.books
set search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' ||
  coalesce(author, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(category, '') || ' ' ||
  coalesce(discipline, '') || ' ' ||
  coalesce(genre, '') || ' ' ||
  coalesce(course_code, '')
);

create or replace function public.assistant_search_physical_inventory(p_query text)
returns table(id bigint, title text, author text, category text, isbn text, available_copies bigint, total_copies bigint, locations text[])
language sql stable security definer set search_path = public
as $$
  select c.id, c.title, c.author, c.category, c.isbn, c.available_copies, c.registered_copies, c.locations
  from public.get_public_physical_catalog() c
  join public.books b on b.id = c.id
  where c.catalog_type in ('physical', 'hybrid') and not b.is_archived
    and (nullif(trim(p_query), '') is null
      or c.title ilike '%' || trim(p_query) || '%'
      or c.author ilike '%' || trim(p_query) || '%'
      or c.category ilike '%' || trim(p_query) || '%'
      or coalesce(c.isbn, '') ilike '%' || trim(p_query) || '%'
      or coalesce(b.description, '') ilike '%' || trim(p_query) || '%'
      or coalesce(b.discipline, '') ilike '%' || trim(p_query) || '%'
      or coalesce(b.genre, '') ilike '%' || trim(p_query) || '%'
      or coalesce(b.course_code, '') ilike '%' || trim(p_query) || '%')
  order by case when lower(c.title) = lower(trim(p_query)) then 0 else 1 end, c.title
  limit 8;
$$;

revoke all on function public.assistant_search_physical_inventory(text) from public, anon;
grant execute on function public.assistant_search_physical_inventory(text) to authenticated;

commit;
