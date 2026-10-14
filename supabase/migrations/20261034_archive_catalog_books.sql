alter table public.books
  add column if not exists is_archived boolean not null default false;

create index if not exists idx_books_active_catalog
  on public.books (title)
  where not is_archived;

create or replace function public.reject_archived_book_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.books
    where id = new.book_id and is_archived
  ) then
    raise exception 'This title has been removed from the catalog';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_archived_borrow_request on public.borrow_requests;
create trigger prevent_archived_borrow_request
before insert on public.borrow_requests
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_physical_request on public.physical_book_requests;
create trigger prevent_archived_physical_request
before insert on public.physical_book_requests
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_physical_waitlist on public.physical_book_waitlist;
create trigger prevent_archived_physical_waitlist
before insert on public.physical_book_waitlist
for each row execute function public.reject_archived_book_requests();

drop trigger if exists prevent_archived_premium_purchase on public.ebook_purchase_requests;
create trigger prevent_archived_premium_purchase
before insert on public.ebook_purchase_requests
for each row execute function public.reject_archived_book_requests();

drop function if exists public.get_public_physical_catalog();
create function public.get_public_physical_catalog()
returns table (
  id bigint, title text, author text, category text, description text, isbn text, cover_image_url text,
  catalog_type text, registered_copies bigint, available_copies bigint, borrowed_copies bigint,
  next_due_date timestamptz, locations text[]
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.title, b.author, b.category, b.description, b.isbn, b.cover_image_url, b.catalog_type,
    count(c.id), count(c.id) filter (where c.status = 'available'), count(c.id) filter (where c.status = 'borrowed'),
    min(c.due_date) filter (where c.status = 'borrowed' and c.due_date is not null),
    array_remove(array_agg(distinct nullif(concat_ws(' · ', c.section, case when c.shelf_number is not null then 'Shelf ' || c.shelf_number end, case when c.row_number is not null then 'Row ' || c.row_number end, case when c.position_number is not null then 'Position ' || c.position_number end, c.location), '')), null)
  from public.books b left join public.physical_book_copies c on c.book_id = b.id
  where b.catalog_type in ('physical', 'hybrid') and not b.is_archived
  group by b.id order by b.title;
$$;

grant execute on function public.get_public_physical_catalog() to anon, authenticated;

create or replace function public.get_public_physical_copy(p_qr_token uuid)
returns table (
  copy_id bigint,
  book_id bigint,
  copy_code text,
  status text,
  due_date timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.book_id, c.copy_code, c.status, c.due_date
  from public.physical_book_copies c
  join public.books b on b.id = c.book_id
  where c.qr_token = p_qr_token
    and b.catalog_type in ('physical', 'hybrid')
    and not b.is_archived
  limit 1;
$$;

grant execute on function public.get_public_physical_copy(uuid) to anon, authenticated;
