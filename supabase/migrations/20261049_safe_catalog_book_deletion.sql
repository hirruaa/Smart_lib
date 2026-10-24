begin;

-- Permanent catalog deletion is limited to archived titles with no dependent
-- member activity, circulation, payment, or access records.

drop policy if exists books_admin_delete on public.books;
revoke delete on public.books from authenticated;

create or replace function public.admin_delete_catalog_book(p_book_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_book public.books;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  select * into target_book from public.books where id = p_book_id for update;
  if target_book.id is null then raise exception 'Book not found'; end if;
  if not target_book.is_archived then raise exception 'Archive this title before permanently deleting it'; end if;

  if exists (select 1 from public.borrow_requests where book_id = p_book_id)
    or exists (select 1 from public.digital_book_loan_history where book_id = p_book_id)
    or exists (select 1 from public.physical_book_requests where book_id = p_book_id)
    or exists (select 1 from public.physical_book_loan_history where book_id = p_book_id)
    or exists (select 1 from public.ebook_purchase_requests where book_id = p_book_id)
    or exists (select 1 from public.book_access_grants where book_id = p_book_id)
    or exists (select 1 from public.book_contributions where approved_book_id = p_book_id)
    or exists (select 1 from public.study_notes where book_id = p_book_id)
    or exists (select 1 from public.highlights where book_id = p_book_id)
    or exists (select 1 from public.study_drawings where book_id = p_book_id)
    or exists (select 1 from public.reading_progress where book_id = p_book_id)
    or exists (select 1 from public.physical_book_waitlist where book_id = p_book_id)
    or exists (select 1 from public.member_activity_ledger where entity_type = 'books' and entity_id = p_book_id::text)
    or exists (select 1 from public.audit_logs where (target_type = 'book' and target_id = p_book_id)
      or details ->> 'book_id' = p_book_id::text) then
    raise exception 'This title has member activity or circulation history and cannot be permanently deleted. Keep it archived instead.';
  end if;

  if nullif(trim(target_book.storage_path), '') is not null
    or nullif(trim(target_book.storage_file_id), '') is not null
    or nullif(trim(target_book.pdf_url), '') is not null then
    raise exception 'This title still has an attached file. Keep it archived instead.';
  end if;

  delete from public.books where id = p_book_id;
end;
$$;

revoke all on function public.admin_delete_catalog_book(bigint) from public, anon;
grant execute on function public.admin_delete_catalog_book(bigint) to authenticated;

commit;
