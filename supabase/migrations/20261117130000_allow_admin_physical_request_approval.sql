begin;

do $$
declare
  routine_oid oid;
  definition text;
  updated_definition text;
  librarian_guard text :=
    'if not public.is_librarian() then raise exception ''Librarian access required''; end if;';
  staff_guard text :=
    'if not (public.is_admin() or public.is_librarian()) then raise exception ''Library staff access required''; end if;';
begin
  select p.oid into routine_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_confirm_physical_checkout'
    and p.proargtypes = '20 25 1700 25 16'::oidvector;

  if routine_oid is null then
    raise exception 'Expected exact-copy physical checkout approval function was not found';
  end if;

  definition := pg_get_functiondef(routine_oid);
  updated_definition := replace(definition, librarian_guard, staff_guard);

  if updated_definition = definition and position(staff_guard in definition) = 0 then
    raise exception 'Could not verify physical checkout approval authorization';
  end if;

  if updated_definition <> definition then
    execute updated_definition;
  end if;
end;
$$;

commit;
