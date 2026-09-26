-- Smart Lib contribution upload repair
-- Run this once in Supabase SQL Editor after the base schema.

alter table public.books add column if not exists storage_provider text not null default 'supabase';
alter table public.books add column if not exists storage_file_id text;
alter table public.books add column if not exists storage_path text;
alter table public.books add column if not exists file_name text;
alter table public.books add column if not exists file_size bigint;
alter table public.books add column if not exists mime_type text;
alter table public.books add column if not exists access_mode text not null default 'loan';
alter table public.books add column if not exists access_duration_days integer not null default 30;
alter table public.books drop constraint if exists books_access_duration_days_check;
alter table public.books add constraint books_access_duration_days_check check (access_duration_days between 1 and 3650);


alter table public.book_contributions add column if not exists storage_provider text not null default 'supabase';
alter table public.book_contributions add column if not exists storage_file_id text;
alter table public.book_contributions add column if not exists storage_path text;
alter table public.book_contributions add column if not exists file_name text;
alter table public.book_contributions add column if not exists file_size bigint;
alter table public.book_contributions add column if not exists mime_type text;
alter table public.book_contributions add column if not exists review_feedback text;

alter table public.book_contributions drop constraint if exists book_contributions_status_check;
alter table public.book_contributions add constraint book_contributions_status_check
  check (status in ('pending', 'approved', 'rejected', 'revision_requested', 'withdrawn'));

alter table public.books drop constraint if exists books_storage_provider_check;
alter table public.books add constraint books_storage_provider_check
  check (storage_provider in ('supabase', 'google_drive', 'external'));
alter table public.book_contributions drop constraint if exists book_contributions_storage_provider_check;
alter table public.book_contributions add constraint book_contributions_storage_provider_check
  check (storage_provider in ('supabase', 'google_drive', 'external'));

-- Students may upload only to their own contribution folder. They cannot
-- update, delete, or read arbitrary files through this policy.
drop policy if exists "Students upload contribution PDFs" on storage.objects;
create policy "Students upload contribution PDFs" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ebooks'
  and name like 'contributions/' || auth.uid()::text || '/%'
);

drop policy if exists "Owners and admins read contribution PDFs" on storage.objects;
create policy "Owners and admins read contribution PDFs" on storage.objects
for select to authenticated
using (
  bucket_id = 'ebooks'
  and (
    public.is_admin()
    or name like 'contributions/' || auth.uid()::text || '/%'
    or exists (
      select 1 from public.books b
      join public.borrow_requests br on br.book_id = b.id
      where (b.storage_path = name or b.pdf_url = name or b.pdf_url like '%' || name)
        and br.student_id = auth.uid()
        and br.status = 'approved'
        and br.returned_date is null
        and br.due_date > now()
    )
    or exists (
      select 1 from public.books b
      join public.book_access_grants bag on bag.book_id = b.id
      where (b.storage_path = name or b.pdf_url = name or b.pdf_url like '%' || name)
        and bag.student_id = auth.uid()
        and bag.status = 'active'
        and bag.expires_at > now()
    )
  )
);

-- The current app submits through validated RPCs, not direct table inserts.
revoke insert on public.book_contributions from anon, authenticated;

create or replace function public.submit_book_contribution_v2(
  p_title text,
  p_author text,
  p_description text default null,
  p_pdf_url text default null,
  p_storage_provider text default 'supabase',
  p_storage_file_id text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_file_size bigint default null,
  p_mime_type text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted public.book_contributions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  if p_storage_provider not in ('supabase', 'google_drive', 'external') then
    raise exception 'Invalid storage provider';
  end if;
  if p_file_size is not null and (p_file_size < 0 or p_file_size > 52428800) then
    raise exception 'PDF files must be 50 MB or smaller';
  end if;

  insert into public.book_contributions(
    user_id, title, author, description, pdf_url,
    storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type
  ) values (
    auth.uid(), trim(p_title), trim(p_author), nullif(trim(p_description), ''), nullif(trim(p_pdf_url), ''),
    p_storage_provider, nullif(trim(p_storage_file_id), ''), nullif(trim(p_storage_path), ''),
    nullif(trim(p_file_name), ''), p_file_size, nullif(trim(p_mime_type), '')
  ) returning * into submitted;
  return submitted;
end;
$$;

create or replace function public.student_resubmit_contribution_v2(
  contribution_id bigint,
  contribution_title text,
  contribution_author text,
  contribution_description text default null,
  contribution_pdf_url text default null,
  contribution_storage_provider text default 'supabase',
  contribution_storage_file_id text default null,
  contribution_storage_path text default null,
  contribution_file_name text default null,
  contribution_file_size bigint default null,
  contribution_mime_type text default null
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_contribution public.book_contributions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(contribution_title), '') is null or nullif(trim(contribution_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  update public.book_contributions
  set title = trim(contribution_title),
      author = trim(contribution_author),
      description = nullif(trim(contribution_description), ''),
      pdf_url = nullif(trim(contribution_pdf_url), ''),
      storage_provider = contribution_storage_provider,
      storage_file_id = nullif(trim(contribution_storage_file_id), ''),
      storage_path = nullif(trim(contribution_storage_path), ''),
      file_name = nullif(trim(contribution_file_name), ''),
      file_size = contribution_file_size,
      mime_type = nullif(trim(contribution_mime_type), ''),
      status = 'pending',
      review_feedback = null,
      reviewed_by = null,
      reviewed_at = null
  where id = contribution_id and user_id = auth.uid() and status = 'revision_requested'
  returning * into updated_contribution;
  if updated_contribution.id is null then raise exception 'Contribution is not available for revision'; end if;
  return updated_contribution;
end;
$$;

-- Carry the uploaded file metadata into the library item after approval.
create or replace function public.admin_review_book_contribution(
  contribution_id bigint,
  decision text,
  reward_points integer default 25,
  access_points integer default 0
)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.book_contributions;
  created_book_id bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid contribution decision'; end if;
  if reward_points < 0 or reward_points > 100 then raise exception 'Reward must be between 0 and 100 points'; end if;
  if access_points < 0 then raise exception 'Access cost cannot be negative'; end if;

  select * into contribution from public.book_contributions where id = contribution_id for update;
  if contribution.id is null or contribution.status <> 'pending' then raise exception 'Pending contribution not found'; end if;

  if decision = 'approved' then
    insert into public.books(
      title, author, category, description, pdf_url,
      storage_provider, storage_file_id, storage_path, file_name, file_size, mime_type, access_points
    ) values (
      contribution.title, contribution.author, 'Community contribution', contribution.description, contribution.pdf_url,
      contribution.storage_provider, contribution.storage_file_id, contribution.storage_path,
      contribution.file_name, contribution.file_size, contribution.mime_type, access_points
    ) returning id into created_book_id;
    update public.profiles set points_balance = points_balance + reward_points where id = contribution.user_id;
    if reward_points > 0 then
      insert into public.point_transactions(user_id, amount, transaction_type, reference_id, description)
      values (contribution.user_id, reward_points, 'contribution_reward', contribution.id, 'Approved library contribution');
    end if;
  end if;

  update public.book_contributions
  set status = decision, points_awarded = case when decision = 'approved' then reward_points else 0 end,
      approved_book_id = created_book_id, reviewed_by = auth.uid(), reviewed_at = now()
  where id = contribution.id returning * into contribution;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (contribution.user_id, 'contribution_review',
    case when decision = 'approved' then 'Contribution approved' else 'Contribution reviewed' end,
    case when decision = 'approved' then 'Your resource was added to the library.' else 'Your submitted resource was not approved.' end,
    contribution.id);
  return contribution;
end;
$$;

create or replace function public.admin_request_contribution_revision(contribution_id bigint, feedback text)
returns public.book_contributions
language plpgsql
security definer
set search_path = public
as $$
declare updated_contribution public.book_contributions;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(feedback), '') is null then raise exception 'Revision feedback is required'; end if;
  update public.book_contributions
  set status = 'revision_requested', review_feedback = trim(feedback), reviewed_by = auth.uid(), reviewed_at = now()
  where id = contribution_id and status = 'pending'
  returning * into updated_contribution;
  if updated_contribution.id is null then raise exception 'Pending contribution not found'; end if;
  insert into public.notifications(user_id, event_type, title, message, reference_id)
  values (updated_contribution.user_id, 'contribution_revision', 'Revision requested', trim(feedback), contribution_id);
  return updated_contribution;
end;
$$;

grant execute on function public.submit_book_contribution_v2(text, text, text, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.student_resubmit_contribution_v2(bigint, text, text, text, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer) to authenticated;
grant execute on function public.admin_request_contribution_revision(bigint, text) to authenticated;

-- Optional points and recognition tables used by the student wallet and admin insights.
create table if not exists public.recognition_awards (
  id bigint generated by default as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  points integer not null check (points > 0),
  reason text not null,
  awarded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.book_access_grants (
  id bigint generated by default as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  book_id bigint not null references public.books(id) on delete cascade,
  access_type text not null default 'admin_grant',
  points_paid integer not null default 0 check (points_paid >= 0),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id bigint generated by default as identity primary key,
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  reward_type text not null default 'academic',
  stock integer check (stock is null or stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id bigint generated by default as identity primary key,
  name text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id bigint not null references public.achievements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.recognition_awards enable row level security;
alter table public.book_access_grants enable row level security;
alter table public.rewards enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists recognition_awards_read_own_or_admin on public.recognition_awards;
create policy recognition_awards_read_own_or_admin on public.recognition_awards
for select to authenticated using (student_id = auth.uid() or public.is_admin());
drop policy if exists book_access_grants_read_own_or_admin on public.book_access_grants;
create policy book_access_grants_read_own_or_admin on public.book_access_grants
for select to authenticated using (student_id = auth.uid() or public.is_admin());
drop policy if exists rewards_read_authenticated on public.rewards;
create policy rewards_read_authenticated on public.rewards
for select to authenticated using (is_active or public.is_admin());
drop policy if exists achievements_read_authenticated on public.achievements;
create policy achievements_read_authenticated on public.achievements
for select to authenticated using (true);
drop policy if exists user_achievements_read_own_or_admin on public.user_achievements;
create policy user_achievements_read_own_or_admin on public.user_achievements
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists audit_logs_read_admin on public.audit_logs;
create policy audit_logs_read_admin on public.audit_logs
for select to authenticated using (public.is_admin());

grant select on public.recognition_awards, public.book_access_grants, public.rewards,
  public.achievements, public.user_achievements to authenticated;
grant select on public.audit_logs to authenticated;
