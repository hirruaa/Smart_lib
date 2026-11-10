-- Permanently retire paid e-book purchases and remove their historical data.
-- Empty the private proof bucket through the Storage API before applying this
-- migration; direct SQL deletion from storage.objects does not delete blobs.
begin;

do $$
begin
  if to_regclass('storage.buckets') is not null
    and exists (select 1 from storage.buckets where id = 'ebook-payment-proofs') then
    raise exception 'Run node scripts/purge-retired-ebook-proofs.mjs with CONFIRM_EBOOK_PROOF_PURGE=1 before applying this migration';
  end if;
end;
$$;

drop policy if exists ebook_payment_proofs_upload_own on storage.objects;
drop policy if exists ebook_payment_proofs_read_own_or_admin on storage.objects;
drop policy if exists ebook_payment_proofs_delete_unlinked_own on storage.objects;

drop function if exists public.request_premium_ebook_purchase(bigint, text, text);
drop function if exists public.admin_decide_ebook_purchase(bigint, text);

delete from public.book_access_grants where access_type = 'premium_purchase';
delete from public.notifications where event_type like 'ebook_purchase%';

do $$
declare
  trigger_mode "char";
  has_ledger_trigger boolean;
begin
  select tgenabled into trigger_mode
  from pg_trigger
  where tgrelid = 'public.member_activity_ledger'::regclass
    and tgname = 'member_activity_ledger_no_update'
    and not tgisinternal;
  has_ledger_trigger := found;

  if has_ledger_trigger and trigger_mode <> 'D' then
    execute 'alter table public.member_activity_ledger disable trigger member_activity_ledger_no_update';
  end if;

  delete from public.member_activity_ledger
  where related_request_type = 'ebook_purchase'
    or event_type like 'ebook_purchase%'
    or entity_type = 'ebook_purchase_requests';

  if has_ledger_trigger and trigger_mode = 'O' then
    execute 'alter table public.member_activity_ledger enable trigger member_activity_ledger_no_update';
  elsif has_ledger_trigger and trigger_mode = 'A' then
    execute 'alter table public.member_activity_ledger enable always trigger member_activity_ledger_no_update';
  elsif has_ledger_trigger and trigger_mode = 'R' then
    execute 'alter table public.member_activity_ledger enable replica trigger member_activity_ledger_no_update';
  end if;
end;
$$;

drop table if exists public.ebook_purchase_requests;

do $$
declare
  function_definition text;
  old_branch text := $old$
    if tg_table_name = 'ebook_purchase_requests'
       and old_row->>'status' is not distinct from new_row->>'status'
       and old_row->>'receipt_number' is not distinct from new_row->>'receipt_number' then return new; end if;
$old$;
  old_case text := $old$
    when 'ebook_purchase_requests' then
      related_type_value := 'ebook_purchase'; related_id_value := nullif(source_row->>'id', '')::bigint;
      event_type_value := case when source_row->>'status' = 'approved' then 'ebook_purchase_approved' else 'ebook_purchase_status_changed' end;
      summary_value := 'Digital purchase ' || coalesce(source_row->>'status', 'updated') || '.';
$old$;
begin
  if to_regprocedure('public.record_member_activity_event()') is not null then
    function_definition := pg_get_functiondef('public.record_member_activity_event()'::regprocedure);
    function_definition := replace(function_definition, old_branch, '');
    function_definition := replace(function_definition, old_case, '');
    if position('ebook_purchase_requests' in function_definition) > 0 then
      raise exception 'Unable to remove the retired purchase branch from record_member_activity_event()';
    end if;
    execute function_definition;
  end if;

  if to_regprocedure('public.admin_delete_catalog_book(bigint)') is not null then
    function_definition := pg_get_functiondef('public.admin_delete_catalog_book(bigint)'::regprocedure);
    function_definition := replace(function_definition,
      '    or exists (select 1 from public.ebook_purchase_requests where book_id = p_book_id)' || E'\n', '');
    if position('ebook_purchase_requests' in function_definition) > 0 then
      raise exception 'Unable to remove the retired purchase reference from admin_delete_catalog_book()';
    end if;
    execute function_definition;
  end if;
end;
$$;

update public.books
set access_mode = case
  when catalog_type = 'physical' then 'restricted'
  when access_points > 0 then 'points'
  else 'free'
end
where access_mode = 'premium';

alter table public.books drop column if exists premium_price;

commit;
