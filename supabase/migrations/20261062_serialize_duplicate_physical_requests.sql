begin;

do $$
begin
  if to_regprocedure('public.request_physical_book_without_duplicate_race(bigint, bigint, integer, text, text, text)') is null then
    alter function public.request_physical_book(bigint, bigint, integer, text, text, text)
      rename to request_physical_book_without_duplicate_race;
  end if;

  if to_regprocedure('public.request_physical_book(bigint, bigint, integer, text, text, text)') is null then
    execute $function$
      create function public.request_physical_book(
        p_book_id bigint,
        p_copy_id bigint,
        p_duration_days integer,
        p_payment_method text,
        p_transaction_reference text default null,
        p_payment_proof_path text default null
      )
      returns public.physical_book_requests
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        current_user_id uuid := auth.uid();
      begin
        if current_user_id is null then raise exception 'Sign in to request a physical book'; end if;
        perform pg_advisory_xact_lock(hashtextextended(
          'physical-request:' || current_user_id::text || ':' || p_book_id::text, 0
        ));
        return public.request_physical_book_without_duplicate_race(
          p_book_id, p_copy_id, p_duration_days, p_payment_method, p_transaction_reference, p_payment_proof_path
        );
      end;
      $body$;
    $function$;
  end if;
end;
$$;

revoke all on function public.request_physical_book_without_duplicate_race(bigint, bigint, integer, text, text, text)
  from public, anon, authenticated;

revoke all on function public.request_physical_book(bigint, bigint, integer, text, text, text) from public, anon;
grant execute on function public.request_physical_book(bigint, bigint, integer, text, text, text) to authenticated;

commit;
