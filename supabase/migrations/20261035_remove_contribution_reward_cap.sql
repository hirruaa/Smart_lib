begin;

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
  if reward_points < 0 then raise exception 'Reward cannot be negative'; end if;
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

revoke all on function public.admin_review_book_contribution(bigint, text, integer, integer) from public, anon;
grant execute on function public.admin_review_book_contribution(bigint, text, integer, integer) to authenticated;

commit;
