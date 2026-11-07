alter table public.books add column if not exists course_code text;
alter table public.books add column if not exists source_type text;

update public.books
set source_type = 'catalog'
where source_type is null;

update public.books
set category = 'Uncategorized',
    source_type = 'community_contribution'
where lower(trim(category)) = 'community contribution';

update public.books
set course_code = trim(category),
    category = 'Uncategorized'
where course_code is null
  and trim(category) ~* '^[a-z]{2,6}[- ]?[0-9]{2,4}[a-z]?$';

alter table public.books alter column source_type set default 'staff_added';
alter table public.books alter column source_type set not null;
alter table public.books drop constraint if exists books_source_type_check;
alter table public.books add constraint books_source_type_check
  check (source_type in ('catalog', 'staff_added', 'community_contribution'));
alter table public.books drop constraint if exists books_course_code_check;
alter table public.books add constraint books_course_code_check
  check (course_code is null or char_length(trim(course_code)) between 1 and 32);

create or replace function public.normalize_book_metadata_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(trim(new.category)) = 'community contribution' then
    new.category := 'Uncategorized';
    new.source_type := 'community_contribution';
  elsif trim(new.category) ~* '^[a-z]{2,6}[- ]?[0-9]{2,4}[a-z]?$' then
    new.course_code := coalesce(nullif(trim(new.course_code), ''), trim(new.category));
    new.category := 'Uncategorized';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_book_metadata_fields on public.books;
create trigger trg_normalize_book_metadata_fields
before insert or update of category, course_code, source_type
on public.books
for each row execute function public.normalize_book_metadata_fields();
revoke all on function public.normalize_book_metadata_fields() from public, anon, authenticated;

create or replace function public.admin_award_recognition(
  target_user_id uuid,
  award_category text,
  award_points integer,
  award_reason text
)
returns public.recognition_awards
language plpgsql
security definer
set search_path = public
as $$
declare
  new_award public.recognition_awards;
  daily_awarded bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if award_points <= 0 then raise exception 'Award points must be positive'; end if;
  if nullif(trim(award_reason), '') is null then raise exception 'Award reason is required'; end if;

  perform pg_advisory_xact_lock(hashtext('admin_daily_points'), hashtext(auth.uid()::text));
  select coalesce(sum(points), 0)
    into daily_awarded
    from public.recognition_awards
    where awarded_by = auth.uid()
      and created_at >= date_trunc('day', now())
      and created_at < date_trunc('day', now()) + interval '1 day';

  if daily_awarded + award_points > 1000 then
    raise exception 'Daily points grant limit of 1,000 points reached';
  end if;

  insert into public.recognition_awards(student_id, category, points, reason, awarded_by)
  values (target_user_id, award_category, award_points, trim(award_reason), auth.uid())
  returning * into new_award;
  update public.profiles set points_balance = points_balance + award_points where id = target_user_id;
  insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
  values (target_user_id, award_points, 'admin_adjustment', new_award.id, 'Recognition award: ' || trim(award_category));
  insert into public.audit_logs(actor_id, action, target_type, details)
  values (
    auth.uid(),
    'recognition_awarded',
    'profile',
    jsonb_build_object(
      'target_user_id', target_user_id,
      'points', award_points,
      'category', trim(award_category),
      'reason', trim(award_reason),
      'daily_cap', 1000
    )
  );
  return new_award;
end;
$$;

revoke all on function public.admin_award_recognition(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_award_recognition(uuid, text, integer, text) to authenticated;
