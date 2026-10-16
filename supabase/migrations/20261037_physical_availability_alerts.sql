begin;

create or replace function public.join_physical_book_waitlist(p_book_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to turn on availability alerts';
  end if;

  if exists (
    select 1 from public.physical_book_copies
    where book_id = p_book_id and status = 'available'
  ) then
    raise exception 'A copy is available now; submit a physical loan request instead';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = current_user_id and book_id = p_book_id
      and status in ('pending', 'checked_out')
  ) then
    raise exception 'You already have an open request or loan for this book';
  end if;

  if exists (
    select 1 from public.physical_book_requests
    where student_id = current_user_id and status in ('checked_out', 'lost')
      and (status = 'lost' or due_date < now())
  ) then
    raise exception 'Resolve your overdue or lost library book before turning on alerts';
  end if;

  insert into public.physical_book_waitlist(student_id, book_id)
  values (current_user_id, p_book_id)
  on conflict (student_id, book_id) do nothing;
end;
$$;

-- Keep the legacy RPC for callers; copy-state transitions now send the broadcast.
create or replace function public.offer_next_physical_waitlist(
  p_book_id bigint,
  p_copy_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;

create or replace function public.notify_physical_availability_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'available' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'available' then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.physical_book_copies copy
    where copy.book_id = new.book_id
      and copy.id <> new.id
      and copy.status = 'available'
  ) then
    return new;
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  select alert.student_id,
    'physical_book_available',
    concat(coalesce(book.title, 'A physical book'), ' is available'),
    concat('A physical copy of "', coalesce(book.title, 'this book'), '" is available. Submit your request soon; this alert does not reserve a copy, and checkout is first come, first served.'),
    new.book_id
  from public.physical_book_waitlist alert
  join public.books book on book.id = alert.book_id
  where alert.book_id = new.book_id
    and not exists (
      select 1
      from public.physical_book_requests request
      where request.student_id = alert.student_id
        and (
          request.status = 'lost'
          or (request.status in ('checked_out', 'return_pending') and request.due_date < now())
        )
    )
    and (
      select coalesce(sum(fine.amount), 0)
      from public.fines fine
      where fine.student_id = alert.student_id
        and fine.status = 'unpaid'
        and fine.physical_book_request_id is not null
    ) < 100;

  return new;
end;
$$;

drop trigger if exists notify_physical_availability_alerts on public.physical_book_copies;
create trigger notify_physical_availability_alerts
after insert or update of status on public.physical_book_copies
for each row execute function public.notify_physical_availability_alerts();

revoke all on function public.notify_physical_availability_alerts() from public, anon, authenticated;
revoke all on function public.offer_next_physical_waitlist(bigint, bigint) from public, anon, authenticated;
grant execute on function public.offer_next_physical_waitlist(bigint, bigint) to service_role;
grant execute on function public.join_physical_book_waitlist(bigint) to authenticated;

commit;
