-- Allow the short access periods offered by the student dashboard.
-- Run this once in the Supabase SQL Editor for an existing project.

alter table public.borrow_requests
  drop constraint if exists borrow_requests_duration_days_valid;

alter table public.borrow_requests
  drop constraint if exists borrow_requests_duration_days_check;

alter table public.borrow_requests
  add constraint borrow_requests_duration_days_check
  check (duration_days between 1 and 90);
