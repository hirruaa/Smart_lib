-- Apply to an existing Smart Lib database after taking a verified backup
-- and testing this migration against staging. This does not modify table data.
begin;

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
  owner_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  owner_path := 'contributions/' || auth.uid()::text || '/';

  if nullif(trim(p_title), '') is null or nullif(trim(p_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  if p_storage_provider is distinct from 'supabase' then
    raise exception 'Contributions must use private Supabase storage';
  end if;
  if nullif(trim(p_storage_path), '') is null
    or p_storage_file_id is not null
    or (
      p_storage_path not like owner_path || '%'
      and p_storage_path not like 'ebooks/' || owner_path || '%'
    )
    or regexp_replace(p_storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(p_pdf_url), '') is distinct from nullif(trim(p_storage_path), '') then
    raise exception 'Contribution files must use the submitter private storage folder';
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
  contribution_storage_provider text default null,
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
  owner_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  owner_path := 'contributions/' || auth.uid()::text || '/';

  if nullif(trim(contribution_title), '') is null or nullif(trim(contribution_author), '') is null then
    raise exception 'Title and author are required';
  end if;
  if contribution_storage_provider is not null and contribution_storage_provider is distinct from 'supabase' then
    raise exception 'Contributions must use private Supabase storage';
  end if;
  if contribution_storage_path is not null and (
    nullif(trim(contribution_storage_path), '') is null
    or contribution_storage_path not like owner_path || '%'
      and contribution_storage_path not like 'ebooks/' || owner_path || '%'
    or regexp_replace(contribution_storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(contribution_pdf_url), '') is distinct from nullif(trim(contribution_storage_path), '')
  ) then
    raise exception 'Contribution files must use the submitter private storage folder';
  end if;
  if contribution_storage_file_id is not null then
    raise exception 'Contribution files must use the submitter private storage folder';
  end if;
  if contribution_file_size is not null and (contribution_file_size < 0 or contribution_file_size > 52428800) then
    raise exception 'PDF files must be 50 MB or smaller';
  end if;

  update public.book_contributions
  set title = trim(contribution_title),
      author = trim(contribution_author),
      description = nullif(trim(contribution_description), ''),
      pdf_url = coalesce(nullif(trim(contribution_pdf_url), ''), pdf_url),
      storage_provider = coalesce(contribution_storage_provider,
        case when contribution_storage_path is not null then 'supabase' else storage_provider end),
      storage_file_id = coalesce(nullif(trim(contribution_storage_file_id), ''), storage_file_id),
      storage_path = coalesce(nullif(trim(contribution_storage_path), ''), storage_path),
      file_name = coalesce(nullif(trim(contribution_file_name), ''), file_name),
      file_size = coalesce(contribution_file_size, file_size),
      mime_type = coalesce(nullif(trim(contribution_mime_type), ''), mime_type),
      status = 'pending',
      review_feedback = null,
      reviewed_by = null,
      reviewed_at = null
  where id = contribution_id and user_id = auth.uid() and status = 'revision_requested'
  returning * into updated_contribution;

  if updated_contribution.id is null then
    raise exception 'Contribution is not available for revision';
  end if;
  if updated_contribution.storage_provider = 'google_drive' then
    if nullif(trim(updated_contribution.storage_file_id), '') is null then
      raise exception 'Google Drive contribution is missing its file ID';
    end if;
  elsif updated_contribution.storage_provider is distinct from 'supabase'
    or nullif(trim(updated_contribution.storage_path), '') is null
    or (
      updated_contribution.storage_path not like owner_path || '%'
      and updated_contribution.storage_path not like 'ebooks/' || owner_path || '%'
    )
    or regexp_replace(updated_contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
    or nullif(trim(updated_contribution.pdf_url), '') is distinct from nullif(trim(updated_contribution.storage_path), '') then
    raise exception 'Contribution file must be in the submitter private storage folder before resubmission';
  end if;
  return updated_contribution;
end;
$$;

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
  owner_path text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid contribution decision'; end if;
  if reward_points < 0 or reward_points > 100 then raise exception 'Reward must be between 0 and 100 points'; end if;
  if access_points < 0 then raise exception 'Access cost cannot be negative'; end if;

  select * into contribution from public.book_contributions where id = contribution_id for update;
  if contribution.id is null or contribution.status <> 'pending' then raise exception 'Pending contribution not found'; end if;

  if decision = 'approved' then
    owner_path := 'contributions/' || contribution.user_id::text || '/';
    if contribution.storage_provider = 'google_drive' then
      if nullif(trim(contribution.storage_file_id), '') is null then
        raise exception 'Google Drive contribution is missing its file ID';
      end if;
    elsif contribution.storage_provider is distinct from 'supabase'
      or nullif(trim(contribution.storage_path), '') is null
      or (
        contribution.storage_path not like owner_path || '%'
        and contribution.storage_path not like 'ebooks/' || owner_path || '%'
      )
      or regexp_replace(contribution.storage_path, '^ebooks/', '') ~ '(^|/)(\.|\.\.)(/|$)'
      or nullif(trim(contribution.pdf_url), '') is distinct from nullif(trim(contribution.storage_path), '') then
      raise exception 'Contribution file must be in the submitter private storage folder before approval';
    end if;

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

revoke all on function public.submit_book_contribution_v2(text, text, text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.submit_book_contribution_v2(text, text, text, text, text, text, text, text, bigint, text) to authenticated;
revoke all on function public.student_resubmit_contribution_v2(bigint, text, text, text, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.student_resubmit_contribution_v2(bigint, text, text, text, text, text, text, text, text, bigint, text) to authenticated;
revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer) to authenticated;

drop policy if exists "Owners read legacy contribution PDFs" on storage.objects;
create policy "Owners read legacy contribution PDFs" on storage.objects
for select to authenticated
using (
  bucket_id = 'ebooks'
  and name like 'ebooks/contributions/' || auth.uid()::text || '/%'
);

commit;
