-- Remove the per-student active digital loan cap from an existing Smart Lib database.
-- Run this once in the Supabase SQL Editor after deploying the updated app.

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests language plpgsql security definer set search_path = public as $$
declare
  requested public.borrow_requests;
  required_points integer;
  user_points integer;
  book_points integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days < 1 or p_duration_days > 90 then
    raise exception 'Choose a lending period between 1 and 90 days';
  end if;

  select access_points into book_points from public.books where id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  required_points := ceil(p_duration_days / 7.0)::integer * book_points;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));

  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then
    raise exception 'You already have an active request or loan for this resource';
  end if;

  select points_balance into user_points from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days', required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost)
  values (auth.uid(), p_book_id, p_duration_days, required_points)
  returning * into requested;
  if required_points > 0 then
    update public.profiles set points_balance = points_balance - required_points where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
  end if;
  return requested;
end;
$$;

grant execute on function public.request_digital_loan(bigint, integer) to authenticated;
