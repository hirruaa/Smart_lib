begin;

-- Paid e-book checkout is retired. Keep historical payment records for audit,
-- but prevent new premium modes and remove the purchase RPC entry points.
update public.books
set access_mode = case
      when catalog_type = 'physical' and access_mode in ('free', 'points', 'restricted') then access_mode
      when catalog_type = 'physical' then 'restricted'
      when access_mode = 'points' or access_points > 0 then 'points'
      else 'free'
    end,
    premium_price = 0;

alter table public.books alter column access_mode set default 'free';
alter table public.books drop constraint if exists books_access_mode_free_points_check;
alter table public.books add constraint books_access_mode_free_points_check
  check (access_mode in ('free', 'points') or (catalog_type = 'physical' and access_mode = 'restricted'));

drop function if exists public.request_premium_ebook_purchase(bigint, text, text);
drop function if exists public.admin_decide_ebook_purchase(bigint, text);
drop policy if exists ebook_payment_proofs_upload_own on storage.objects;

commit;
