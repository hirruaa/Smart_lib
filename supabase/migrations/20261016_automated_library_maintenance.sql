-- Connect scheduled maintenance to the existing physical expiry, waitlist,
-- reminder, and overdue-fine workflows.
begin;

create or replace function public.system_run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  processed_count integer;
  fine_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select public.system_process_physical_reminders() into processed_count;
  perform public.calculate_overdue_fines();
  select count(*)::integer into fine_count from public.fines where status = 'unpaid';

  return jsonb_build_object(
    'processed', coalesce(processed_count, 0),
    'fines_updated', coalesce(fine_count, 0)
  );
end;
$$;

revoke all on function public.system_run_maintenance() from public, anon, authenticated;
grant execute on function public.system_run_maintenance() to service_role;

commit;
