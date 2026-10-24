begin;

-- Keep member fines and receipt/payment lists current while a dashboard is open.
do $$
begin
  begin
    alter publication supabase_realtime add table public.fines;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.library_print_payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ebook_purchase_requests;
  exception when duplicate_object then null;
  end;
end;
$$;

commit;
