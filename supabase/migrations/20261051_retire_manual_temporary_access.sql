begin;

-- Manual temporary access is no longer part of the staff workflow. Keep
-- existing grant rows intact so current access and member history continue.
drop function if exists public.admin_grant_book_access(uuid, bigint, integer, text);

commit;
