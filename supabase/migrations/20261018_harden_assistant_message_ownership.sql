-- Keep assistant messages inside sessions owned by the same authenticated user.
-- Apply this migration to existing Supabase projects.

drop policy if exists assistant_messages_manage_own on public.assistant_messages;

create policy assistant_messages_manage_own
on public.assistant_messages
for all
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.assistant_sessions s
    where s.id = assistant_messages.session_id
      and s.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.assistant_sessions s
    where s.id = assistant_messages.session_id
      and s.user_id = auth.uid()
  )
);
