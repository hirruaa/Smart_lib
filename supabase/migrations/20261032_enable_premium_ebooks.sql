-- Enable the existing staff-verified premium e-book purchase workflow.
-- Premium titles require payment evidence and staff approval; approval grants
-- permanent access and issues a digital receipt.

drop trigger if exists prevent_unverified_premium_ebook on public.books;

revoke all on function public.request_premium_ebook_purchase(bigint, text, text) from public, anon;
grant execute on function public.request_premium_ebook_purchase(bigint, text, text) to authenticated;

revoke all on function public.admin_decide_ebook_purchase(bigint, text) from public, anon;
grant execute on function public.admin_decide_ebook_purchase(bigint, text) to authenticated;
