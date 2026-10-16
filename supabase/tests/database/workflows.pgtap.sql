-- Behavioral database tests for an isolated Supabase test database.
-- Apply COMPLETE_SCHEMA.sql, then the physical borrowing policy and availability alert migrations, to a disposable local database first.
begin;
select plan(63);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d3600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-student@smartlib.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d3600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-other@smartlib.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d3600000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qa-admin@smartlib.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles set role = 'student', points_balance = 30
where id = 'd3600000-0000-4000-8000-000000000001';
update public.profiles set role = 'student', points_balance = 0
where id = 'd3600000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin'
where id = 'd3600000-0000-4000-8000-000000000003';

insert into public.books (id, title, author, category, catalog_type, access_mode, access_points)
values
  (910001, 'QA free digital resource', 'QA Author', 'QA', 'digital', 'free', 0),
  (910002, 'QA points digital resource', 'QA Author', 'QA', 'digital', 'points', 3),
  (910003, 'QA insufficient-points resource', 'QA Author', 'QA', 'digital', 'points', 5),
  (910004, 'QA physical resource', 'QA Author', 'QA', 'physical', 'free', 0),
  (910005, 'QA three-day resource', 'QA Author', 'QA', 'digital', 'points', 3),
  (910006, 'QA seven-day resource', 'QA Author', 'QA', 'digital', 'points', 3),
  (910007, 'QA fourteen-day resource', 'QA Author', 'QA', 'digital', 'points', 3)
on conflict (id) do nothing;
insert into public.borrow_requests (student_id, book_id, status, due_date, duration_days, points_cost)
values ('d3600000-0000-4000-8000-000000000001', 910002, 'approved', now() - interval '1 day', 7, 3);
insert into public.borrow_requests (student_id, book_id, status, due_date, duration_days, points_cost)
values ('d3600000-0000-4000-8000-000000000002', 910003, 'approved', now() + interval '7 days', 7, 0);
insert into public.faculty_ranks (id, title, is_active)
values (910010, 'QA Lecturer', true)
on conflict (id) do nothing;
insert into public.academic_courses (id, name, is_active)
values (910010, 'QA Course', true)
on conflict (id) do nothing;

insert into public.physical_book_copies (id, book_id, copy_code, status)
values (910004, 910004, 'QA-WORKFLOW-001', 'available')
on conflict (id) do nothing;
insert into public.physical_loan_options (id, book_id, duration_days, fee_amount, is_active)
values (910004, 910004, 14, 0, true)
on conflict (id) do nothing;
insert into public.book_contributions (
  id, user_id, title, author, description, pdf_url, status,
  storage_provider, storage_path, file_name, file_size, mime_type
) values (
  910020, 'd3600000-0000-4000-8000-000000000001',
  'QA contributed resource', 'QA Contributor', 'A test contribution',
  'contributions/d3600000-0000-4000-8000-000000000001/qa-contribution.pdf',
  'pending', 'supabase',
  'contributions/d3600000-0000-4000-8000-000000000001/qa-contribution.pdf',
  'qa-contribution.pdf', 1024, 'application/pdf'
);
insert into public.book_contributions (
  id, user_id, title, author, pdf_url, status, storage_provider, storage_file_id, file_name, file_size, mime_type
) values (
  910021, 'd3600000-0000-4000-8000-000000000001',
  'QA legacy Drive contribution', 'QA Contributor', 'legacy-drive-file-id',
  'pending', 'google_drive', 'legacy-drive-file-id', 'legacy.pdf', 1024, 'application/pdf'
);
insert into public.book_contributions (
  id, user_id, title, author, pdf_url, status, storage_provider, storage_path, file_name, file_size, mime_type
) values (
  910022, 'd3600000-0000-4000-8000-000000000001',
  'QA legacy prefixed contribution', 'QA Contributor',
  'ebooks/contributions/d3600000-0000-4000-8000-000000000001/legacy.pdf',
  'pending', 'supabase',
  'ebooks/contributions/d3600000-0000-4000-8000-000000000001/legacy.pdf',
  'legacy.pdf', 1024, 'application/pdf'
);
insert into public.reading_progress (user_id, book_id, current_page, total_pages)
values ('d3600000-0000-4000-8000-000000000002', 910001, 3, 20)
on conflict (user_id, book_id) do update set current_page = excluded.current_page;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.submit_book_contribution_v2(
    'QA missing file', 'QA Author', null, null, 'supabase', null, null, 'missing.pdf', 1024, 'application/pdf'
  ) $$,
  'P0001',
  'Contribution files must use the submitter private storage folder',
  'A contribution without a storage path is rejected'
);
select throws_ok(
  $$ select public.submit_book_contribution_v2(
    'QA traversal file', 'QA Author', null,
    'contributions/d3600000-0000-4000-8000-000000000001/../private.pdf',
    'supabase', null,
    'contributions/d3600000-0000-4000-8000-000000000001/../private.pdf',
    'private.pdf', 1024, 'application/pdf'
  ) $$,
  'P0001',
  'Contribution files must use the submitter private storage folder',
  'A contribution path containing traversal segments is rejected'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  'P0001',
  'Only an administrator can change account roles',
  'A student cannot promote their own profile'
);
select is((select count(*)::integer from public.profiles), 1, 'A student sees only their own profile');
select is(
  (select count(*)::integer from public.reading_progress where user_id = 'd3600000-0000-4000-8000-000000000002'),
  0,
  'A student cannot read another member reading progress'
);
select is(
  (select count(*)::integer from public.borrow_requests where student_id = 'd3600000-0000-4000-8000-000000000002'),
  0,
  'A student cannot read another member private loan records'
);

insert into public.reading_progress (user_id, book_id, current_page, total_pages)
values (auth.uid(), 910001, 7, 20)
on conflict (user_id, book_id) do update
set current_page = excluded.current_page, total_pages = excluded.total_pages, updated_at = now();
select is(
  (select current_page from public.reading_progress where user_id = auth.uid() and book_id = 910001),
  7,
  'A student can save and read back their own reading progress'
);

select is((public.request_digital_loan(910001, 7)).status, 'approved', 'Free digital access is approved immediately');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910001), 0, 'Free digital access costs zero points');
select throws_ok(
  $$ select public.request_digital_loan(910002, 2) $$,
  'P0001',
  'Choose one of the available lending periods',
  'Digital access accepts only one of the displayed durations'
);
select is((public.request_digital_loan(910002, 1)).status, 'approved', 'Expired access does not block a new one-day points unlock');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910002 and due_date > now()), 1, 'One-day access charges the prorated point cost');
select is((public.request_digital_loan(910005, 3)).status, 'approved', 'Three-day points access is approved immediately');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910005 and due_date > now()), 2, 'Three-day access charges the prorated point cost');
select is((public.request_digital_loan(910006, 7)).status, 'approved', 'Seven-day points access is approved immediately');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910006 and due_date > now()), 3, 'Seven-day access charges the configured weekly point cost');
select is((public.request_digital_loan(910007, 14)).status, 'approved', 'Eligible points access is approved immediately');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910007 and due_date > now()), 6, 'Fourteen-day access charges the prorated point cost');
select is((select points_balance from public.profiles where id = auth.uid()), 18, 'Points are debited exactly once for each unlocked period');
select is(
  has_function_privilege('authenticated', 'public.return_digital_loan(bigint)', 'EXECUTE'),
  false,
  'Members cannot manually return digital access'
);
select throws_ok(
  $$ select public.request_digital_loan(910002, 14) $$,
  'P0001',
  'You already have an active request or loan for this resource',
  'A duplicate active digital loan is rejected'
);
select throws_ok(
  $$ select public.request_digital_loan(910003, 30) $$,
  'P0001',
  'You need 4 more points to unlock this resource for 30 days',
  'Insufficient points prevent a digital loan'
);
select throws_ok(
  $$ select public.admin_confirm_physical_checkout(910004) $$,
  'P0001',
  'Librarian or administrator access required',
  'A student cannot check out a physical book as a librarian'
);
select throws_ok(
  $$ select public.admin_review_book_contribution(910020, 'approved', 4, 0) $$,
  'P0001',
  'Administrator access required',
  'A student cannot approve a contribution or award points'
);

select is(
  (public.request_physical_book(910004, null, 14, 'cash', null, null)).status,
  'pending',
  'A student can create a physical-book request'
);
select is(
  (select status from public.physical_book_copies where id = 910004),
  'available',
  'A pending physical request does not reserve an available copy'
);
select is(
  (select copy_id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004),
  null,
  'A pending physical request has no assigned copy'
);
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000002', true);
select is(
  (public.request_physical_book(910004, 910004, 14, 'cash', null, null)).status,
  'pending',
  'A second borrower can submit a request while an available copy remains unreserved'
);
select is(
  (select copy_id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004),
  null,
  'The second pending request also has no assigned copy'
);

select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000003', true);
select is((public.admin_confirm_physical_checkout((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004))).status, 'checked_out', 'An administrator checks out the requested physical copy');
select is((select status from public.physical_book_copies where id = 910004), 'borrowed', 'Checkout updates the physical copy state');
select is(
  (select count(*)::integer from public.physical_book_loan_history where request_id = (select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004)),
  1,
  'Checkout creates one physical loan history record'
);
select throws_ok(
  $$ select public.admin_confirm_physical_checkout((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004)) $$,
  'P0001',
  'No physical copy is currently available',
  'A second checkout fails after the last copy is assigned'
);
select is(
  (select status from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004),
  'pending',
  'A failed checkout leaves the second request pending'
);
insert into public.physical_book_waitlist(student_id, book_id)
values
  ('d3600000-0000-4000-8000-000000000001', 910004),
  ('d3600000-0000-4000-8000-000000000002', 910004)
on conflict (student_id, book_id) do nothing;
select is((public.admin_close_physical_loan((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004), 'available')).status, 'returned', 'An administrator records a physical-book return');
select is((select status from public.physical_book_copies where id = 910004), 'available', 'Returning a physical book makes its copy available');
select is(
  (select count(*)::integer from public.notifications
   where event_type = 'physical_book_available'
     and reference_id = 910004
     and user_id in ('d3600000-0000-4000-8000-000000000001', 'd3600000-0000-4000-8000-000000000002')),
  2,
  'A newly available copy alerts all subscribed members at once'
);
select is(
  (select count(*)::integer from public.physical_book_waitlist where book_id = 910004),
  2,
  'Availability alerts do not remove subscriptions or reserve a copy'
);
select is(
  (select status from public.physical_book_loan_history where request_id = (select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004)),
  'returned',
  'Return updates the existing physical loan history record'
);
update public.physical_book_requests
set due_date = '2025-10-01 12:00:00+08'::timestamptz,
    returned_at = '2025-10-08 12:00:00+08'::timestamptz
where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004;
insert into public.library_holidays (holiday_date, name)
values ('2025-10-06', 'QA policy holiday')
on conflict (holiday_date) do nothing;
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.calculate_overdue_fines() $$,
  'A member can refresh overdue fines without a scheduled job'
);
select is(
  (select amount from public.fines where physical_book_request_id = (select id from public.physical_book_requests where student_id = auth.uid() and book_id = 910004)),
  15.00::numeric,
  'Fine calculation excludes the two grace days, Sunday, and a configured holiday'
);
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000003', true);
select is(
  (public.admin_confirm_physical_checkout((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004))).status,
  'checked_out',
  'A returned copy can be checked out to the second borrower'
);
update public.physical_book_requests
set due_date = '2025-01-01 12:00:00+08'::timestamptz
where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004;
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.calculate_overdue_fines() $$,
  'A member refresh classifies an item overdue for 30 days'
);
select is(
  (select status from public.physical_book_requests where student_id = auth.uid() and book_id = 910004),
  'lost',
  'An active loan is classified lost after 30 consecutive overdue days'
);
select is(
  (select amount from public.fines where physical_book_request_id = (select id from public.physical_book_requests where student_id = auth.uid() and book_id = 910004)),
  120.00::numeric,
  'Late-fine accrual stops after 30 overdue days and remains within the ₱500 cap'
);
select throws_ok(
  $$ select public.request_digital_loan(910001, 7) $$,
  'P0001',
  'New digital access is unavailable while an overdue physical item or unpaid physical fine remains.',
  'An overdue lost physical item blocks new digital access'
);
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000003', true);
select is(
  (public.admin_record_physical_fine_payment((select id from public.fines where physical_book_request_id = (select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000002' and book_id = 910004)))).status,
  'paid',
  'A librarian can record cashier settlement for a closed or lost item'
);
select is(
  (public.admin_review_book_contribution(910020, 'approved', 4, 0)).status,
  'approved',
  'An administrator approves a pending contribution'
);
select is(
  (select points_awarded from public.book_contributions where id = 910020),
  4,
  'The contribution stores the administrator-approved reward'
);
select is(
  (select points_balance from public.profiles where id = 'd3600000-0000-4000-8000-000000000001'),
  22,
  'The contributor receives the reviewed reward points'
);
select is(
  (select count(*)::integer from public.point_transactions
   where user_id = 'd3600000-0000-4000-8000-000000000001'
     and transaction_type = 'contribution_reward' and reference_id = 910020),
  1,
  'Contribution approval records one reward transaction'
);
select is(
  (select count(*)::integer from public.books where title = 'QA contributed resource'),
  1,
  'Contribution approval publishes one library resource'
);
select throws_ok(
  $$ select public.admin_review_book_contribution(910020, 'approved', 4, 0) $$,
  'P0001',
  'Pending contribution not found',
  'A contribution cannot be approved twice'
);
select is(
  (select points_balance from public.profiles where id = 'd3600000-0000-4000-8000-000000000001'),
  22,
  'A duplicate approval does not award points again'
);
select is(
  (select count(*)::integer from public.point_transactions
   where user_id = 'd3600000-0000-4000-8000-000000000001'
     and transaction_type = 'contribution_reward' and reference_id = 910020),
  1,
  'A duplicate approval does not create a second reward transaction'
);
select is(
  (select count(*)::integer from public.books where title = 'QA contributed resource'),
  1,
  'A duplicate approval does not publish a second library resource'
);
select is(
  (public.admin_review_book_contribution(910021, 'approved', 0, 0)).status,
  'approved',
  'An administrator can approve a legacy Google Drive contribution'
);
select is(
  (select storage_file_id from public.books where title = 'QA legacy Drive contribution'),
  'legacy-drive-file-id',
  'Approving a legacy Drive contribution preserves its file ID'
);
select is(
  (public.admin_review_book_contribution(910022, 'approved', 0, 0)).status,
  'approved',
  'An administrator can approve a legacy ebooks-prefixed contribution path'
);
select is(
  (select storage_path from public.books where title = 'QA legacy prefixed contribution'),
  'ebooks/contributions/d3600000-0000-4000-8000-000000000001/legacy.pdf',
  'Approving a legacy prefixed path preserves its existing file location'
);
select is(
  (public.admin_update_member_academics(
    'd3600000-0000-4000-8000-000000000002', 'faculty', 'QA School', 'QA Department',
    null, null, 910010, array[910010]::bigint[]
  )).role,
  'faculty',
  'An administrator can promote a student to faculty'
);
select is(
  (select faculty_rank_id from public.profiles where id = 'd3600000-0000-4000-8000-000000000002'),
  910010::bigint,
  'An administrator can assign a faculty title'
);
select is(
  (select count(*)::integer from public.faculty_courses where faculty_id = 'd3600000-0000-4000-8000-000000000002'),
  1,
  'An administrator can assign faculty courses'
);

select * from finish();
rollback;
