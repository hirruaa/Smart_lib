-- Keep the student request and staff queue synchronized with an in-app alert.

create or replace function public.notify_staff_of_physical_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select p.id,
    'physical_request_created',
    'New physical-book request',
    'A member submitted a physical-book request that needs payment and checkout review.',
    new.id
  from public.profiles p
  where p.role in ('admin', 'librarian');
  return new;
end;
$$;

drop trigger if exists trg_notify_staff_of_physical_request on public.physical_book_requests;
create trigger trg_notify_staff_of_physical_request
after insert on public.physical_book_requests
for each row execute function public.notify_staff_of_physical_request();
