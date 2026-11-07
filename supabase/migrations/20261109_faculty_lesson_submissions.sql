begin;

alter table public.book_contributions
  add column if not exists material_type text not null default 'lesson';
update public.book_contributions
set material_type = 'legacy_book'
where approved_book_id is not null;
alter table public.book_contributions
  drop constraint if exists book_contributions_material_type_check;
alter table public.book_contributions
  add constraint book_contributions_material_type_check
  check (material_type in ('lesson', 'legacy_book'));
create index if not exists book_contributions_public_lessons_idx
  on public.book_contributions(status, created_at desc)
  where material_type = 'lesson';

drop policy if exists book_contributions_read_own_or_admin on public.book_contributions;
create policy book_contributions_read_own_or_admin on public.book_contributions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_library_staff()
    or (status = 'approved' and material_type = 'lesson')
  );

drop function if exists public.admin_review_book_contribution(bigint, text, integer, integer);
create or replace function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0,
  rejection_reason text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  owner_path text;
  reason text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid lesson review decision'; end if;
  if reward_points is null or reward_points < 0 or reward_points > 100 then raise exception 'Lesson reward must be between 0 and 100 points'; end if;
  if access_points is distinct from 0 then raise exception 'Faculty lessons do not create books or have a points access cost'; end if;
  if decision = 'rejected'
    and (rejection_reason is null or rejection_reason not in ('Poor Scan Quality', 'Copyright Violation', 'Incorrect Metadata')) then
    raise exception 'Choose a supported rejection reason';
  end if;
  reason := case when decision = 'rejected' then rejection_reason else null end;

  select * into contribution
  from public.book_contributions
  where id = contribution_id
  for update;
  if contribution.id is null or contribution.status <> 'pending' then
    raise exception 'Pending lesson submission not found';
  end if;
  if contribution.material_type <> 'lesson' then
    raise exception 'Only lesson submissions can be reviewed here; books must be added by an administrator';
  end if;

  if decision = 'approved' then
    owner_path := 'contributions/' || contribution.user_id::text || '/';
    if contribution.storage_provider = 'google_drive' then
      if nullif(trim(contribution.storage_file_id), '') is null then
        raise exception 'Lesson file is missing its file ID';
      end if;
    elsif contribution.storage_provider is distinct from 'supabase'
      or nullif(trim(contribution.storage_path), '') is null
      or (
        contribution.storage_path not like owner_path || '%'
        and contribution.storage_path not like 'ebooks/' || owner_path || '%'
      )
      or regexp_replace(contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
      or nullif(trim(contribution.pdf_url), '') is distinct from nullif(trim(contribution.storage_path), '') then
      raise exception 'Lesson file must be in the submitter private storage folder before approval';
    end if;

    update public.profiles
    set points_balance = points_balance + reward_points
    where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved faculty lesson');
    end if;
  end if;

  update public.book_contributions
  set status = decision,
      points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = null,
      material_type = 'lesson',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = reason,
      review_feedback = reason
  where id = contribution.id
  returning * into contribution;

  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (
    contribution.user_id,
    'contribution_review',
    case when decision = 'approved' then 'Lesson approved' else 'Lesson reviewed' end,
    case when decision = 'approved'
      then 'Your lesson is approved and available in the library. ' || reward_points::text || ' points were awarded.'
      else 'Your lesson was not approved: ' || reason || '.' end,
    contribution.id
  );

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    case when decision = 'approved' then 'faculty_lesson_approved' else 'faculty_lesson_rejected' end,
    'book_contribution',
    contribution.id,
    jsonb_build_object('decision', decision, 'points_awarded', contribution.points_awarded, 'reason', reason)
  );

  return contribution;
end;
$$;
revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer, text) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer, text) to authenticated;

commit;
