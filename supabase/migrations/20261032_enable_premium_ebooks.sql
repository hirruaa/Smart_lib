-- Compatibility grants for legacy databases that still have these RPCs.
-- Paid e-book purchases are retired by later migrations.

drop trigger if exists prevent_unverified_premium_ebook on public.books;

do $$
begin
  if to_regprocedure('public.request_premium_ebook_purchase(bigint, text, text)') is not null then
    execute 'revoke all on function public.request_premium_ebook_purchase(bigint, text, text) from public, anon';
    execute 'grant execute on function public.request_premium_ebook_purchase(bigint, text, text) to authenticated';
  end if;
  if to_regprocedure('public.admin_decide_ebook_purchase(bigint, text)') is not null then
    execute 'revoke all on function public.admin_decide_ebook_purchase(bigint, text) from public, anon';
    execute 'grant execute on function public.admin_decide_ebook_purchase(bigint, text) to authenticated';
  end if;
end;
$$;
