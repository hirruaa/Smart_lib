-- Behavioral database tests for an isolated Supabase test database.
-- Apply COMPLETE_SCHEMA.sql to a disposable local/staging database first.
begin;
select plan(34);

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

update public.profiles set role = 'student', points_balance = 8
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
  (910004, 'QA physical resource', 'QA Author', 'QA', 'physical', 'free', 0)
on conflict (id) do nothing;
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
values (910004, 910004, 7, 0, true)
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
insert into public.reading_progress (user_id, book_id, current_page, total_pages)
values ('d3600000-0000-4000-8000-000000000002', 910001, 3, 20)
on conflict (user_id, book_id) do update set current_page = excluded.current_page;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000001', true);

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
select is((public.request_digital_loan(910002, 14)).status, 'approved', 'Eligible points access is approved immediately');
select is((select points_cost from public.borrow_requests where student_id = auth.uid() and book_id = 910002), 6, 'Points access is charged per seven-day period');
select is((select points_balance from public.profiles where id = auth.uid()), 2, 'Points are debited exactly once');
select throws_ok(
  $$ select public.request_digital_loan(910002, 14) $$,
  'P0001',
  'You already have an active request or loan for this resource',
  'A duplicate active digital loan is rejected'
);
select throws_ok(
  $$ select public.request_digital_loan(910003, 7) $$,
  'P0001',
  'You need 3 more points to unlock this resource for 7 days',
  'Insufficient points prevent a digital loan'
);
select is(
  (public.return_digital_loan((select id from public.borrow_requests where student_id = auth.uid() and book_id = 910002))).status,
  'returned',
  'A student can return their own digital loan'
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
  (public.request_physical_book(910004, null, 7, 'cash', null, null)).status,
  'pending',
  'A student can create a physical-book request'
);
select is(
  (select status from public.physical_book_copies where id = 910004),
  'reserved',
  'Physical request creation reserves one available copy'
);
select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.request_physical_book(910004, 910004, 7, 'cash', null, null) $$,
  'P0001',
  'That physical copy is not available; join the waitlist instead',
  'A second borrower cannot reserve the already-reserved last copy'
);

select set_config('request.jwt.claim.sub', 'd3600000-0000-4000-8000-000000000003', true);
select is((public.admin_confirm_physical_checkout((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004))).status, 'checked_out', 'An administrator checks out the requested physical copy');
select is((select status from public.physical_book_copies where id = 910004), 'borrowed', 'Checkout updates the physical copy state');
select is((public.admin_close_physical_loan((select id from public.physical_book_requests where student_id = 'd3600000-0000-4000-8000-000000000001' and book_id = 910004), 'available')).status, 'returned', 'An administrator records a physical-book return');
select is((select status from public.physical_book_copies where id = 910004), 'available', 'Returning a physical book makes its copy available');
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
  6,
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
  6,
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
