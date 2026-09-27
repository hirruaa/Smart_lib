-- Allow signed-in users to delete only their own assistant conversations.
-- Run this in the Supabase SQL editor if deletion returns an RLS error.

grant select, insert, update, delete on public.assistant_sessions to authenticated;

drop policy if exists assistant_sessions_manage_own on public.assistant_sessions;
create policy assistant_sessions_manage_own
on public.assistant_sessions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
