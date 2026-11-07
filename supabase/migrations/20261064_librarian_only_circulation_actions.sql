begin;

do $$
declare
  routine record;
  routine_name text;
  routine_count integer;
  definition text;
  restricted_definition text;
begin
  foreach routine_name in array array[
    'admin_confirm_physical_checkout',
    'admin_close_physical_loan',
    'admin_decide_physical_request',
    'admin_inspect_physical_return',
    'admin_renew_physical_loan',
    'admin_resolve_lost_physical_loan',
    'admin_assess_physical_incident',
    'admin_resolve_physical_damage_case'
  ]
  loop
    routine_count := 0;
    for routine in
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = routine_name
        and p.prokind = 'f'
    loop
      routine_count := routine_count + 1;
      definition := pg_get_functiondef(routine.oid);
      restricted_definition := regexp_replace(
        definition,
        'if not public\.(is_admin|is_library_staff)\(\)[[:space:]]+then[[:space:]]+raise exception ''[^'']+'';[[:space:]]+end if;',
        'if not public.is_librarian() then raise exception ''Librarian access required''; end if;',
        'g'
      );

      if restricted_definition <> definition then
        execute restricted_definition;
      elsif position('if not public.is_librarian() then' in definition) = 0 then
        raise exception 'Could not verify librarian-only authorization for public.%', routine_name;
      end if;
    end loop;

    if routine_count = 0 then
      raise exception 'Expected physical circulation routine public.% was not found', routine_name;
    end if;
  end loop;
end;
$$;

commit;
