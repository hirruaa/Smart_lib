-- Apply after the digital access hardening migration on an existing database.
-- Point costs scale with the selected lending period and only current UI
-- durations are accepted by the database RPC.
begin;

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
  book_mode text;
  book_catalog_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select access_points, access_mode, catalog_type
  into book_points, book_mode, book_catalog_type
  from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  if book_mode = 'restricted' then raise exception 'Administrator access required'; end if;
  if book_mode = 'premium' then
    raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead';
  end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' then ceil(book_points * p_duration_days / 7.0)::integer
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points
  from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days',
      required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, due_date)
  values (
    auth.uid(), p_book_id, p_duration_days, required_points, 'approved',
    now() + make_interval(days => p_duration_days)
  )
  returning * into requested;

  if required_points > 0 then
    update public.profiles
    set points_balance = points_balance - required_points
    where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;

revoke all on function public.return_digital_loan(bigint) from public, anon, authenticated;

commit;
