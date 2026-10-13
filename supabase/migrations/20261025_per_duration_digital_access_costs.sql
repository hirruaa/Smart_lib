-- Store an independent points cost for each supported digital-access period.

alter table public.books
  add column if not exists access_costs jsonb not null default '{}'::jsonb;

alter table public.books
  drop constraint if exists books_access_costs_object_check;
alter table public.books
  add constraint books_access_costs_object_check
  check (jsonb_typeof(access_costs) = 'object');

create or replace function public.request_digital_loan(p_book_id bigint, p_duration_days integer)
returns public.borrow_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  requested public.borrow_requests;
  required_points integer;
  owner_points integer;
  user_points integer;
  book_points integer;
  book_costs jsonb;
  book_mode text;
  book_catalog_type text;
  contributor_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_duration_days not in (1, 3, 7, 14, 30) then
    raise exception 'Choose one of the available lending periods';
  end if;

  select b.access_points, b.access_costs, b.access_mode, b.catalog_type, c.user_id
  into book_points, book_costs, book_mode, book_catalog_type, contributor_id
  from public.books b
  left join public.book_contributions c on c.approved_book_id = b.id and c.status = 'approved'
  where b.id = p_book_id;
  if book_points is null then raise exception 'Resource not found'; end if;
  if book_catalog_type = 'physical' then raise exception 'Physical books use the physical circulation workflow'; end if;
  if contributor_id = auth.uid() then raise exception 'Contributor access is permanent; no points unlock is required'; end if;
  if book_mode in ('loan', 'restricted') then
    book_mode := case when book_points > 0 then 'points' else 'free' end;
  end if;
  if book_mode = 'premium' then raise exception 'Paid e-book checkout is paused. Choose free or points-based access instead'; end if;
  if book_mode not in ('free', 'points') then raise exception 'This digital access mode is unavailable'; end if;

  required_points := case
    when book_mode = 'points' and contributor_id is distinct from auth.uid() then
      case
        when book_costs ? p_duration_days::text
          and (book_costs ->> p_duration_days::text) ~ '^[0-9]+$'
          then (book_costs ->> p_duration_days::text)::integer
        else ceil(book_points * p_duration_days / 7.0)::integer
      end
    else 0
  end;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));
  if exists (
    select 1 from public.borrow_requests
    where student_id = auth.uid() and book_id = p_book_id
      and (status = 'pending' or (status = 'approved' and returned_date is null and due_date > now()))
  ) then raise exception 'You already have an active request or loan for this resource'; end if;

  select points_balance into user_points from public.profiles where id = auth.uid() for update;
  if user_points is null then raise exception 'Profile not found'; end if;
  if user_points < required_points then
    raise exception 'You need % more points to unlock this resource for % days', required_points - user_points, p_duration_days;
  end if;

  insert into public.borrow_requests(student_id, book_id, duration_days, points_cost, status, approved_at, due_date)
  values (auth.uid(), p_book_id, p_duration_days, required_points, 'approved', now(), now() + make_interval(days => p_duration_days))
  returning * into requested;
  if required_points > 0 then
    update public.profiles set points_balance = points_balance - required_points where id = auth.uid();
    insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
    values (auth.uid(), -required_points, 'access_unlock', requested.id, 'Unlocked digital access');
    if contributor_id is not null and contributor_id <> auth.uid() then
      owner_points := required_points / 2;
      if owner_points > 0 then
        update public.profiles set points_balance = points_balance + owner_points where id = contributor_id;
        insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
        values (contributor_id, owner_points, 'contribution_royalty', requested.id, 'Contributor share: 50% of points used to unlock material');
      end if;
    end if;
  end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (auth.uid(), 'borrow_request_status', 'Access approved', 'Your digital library access is ready to use.', requested.id);
  return requested;
end;
$$;

revoke all on function public.request_digital_loan(bigint, integer) from public, anon;
grant execute on function public.request_digital_loan(bigint, integer) to authenticated;
