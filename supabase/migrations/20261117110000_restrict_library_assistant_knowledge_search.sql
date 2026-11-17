begin;

revoke all on function public.match_library_assistant_knowledge(extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_library_assistant_knowledge(extensions.vector, integer)
  to service_role;

commit;
