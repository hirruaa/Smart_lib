begin;

create table if not exists public.library_assistant_settings (
  id boolean primary key default true check (id),
  librarian_name text,
  policy_text text not null default '',
  front_desk_fallback text not null default 'Please contact the library front desk to confirm.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.library_assistant_settings enable row level security;
drop policy if exists library_assistant_settings_read on public.library_assistant_settings;
create policy library_assistant_settings_read on public.library_assistant_settings
  for select to authenticated using (true);
revoke all on public.library_assistant_settings from anon, authenticated;
grant select on public.library_assistant_settings to authenticated;

insert into public.library_assistant_settings as current_settings(id, policy_text)
values (
  true,
  $policy$Physical loans are available for 1, 3, 5, 7, 14, or 30 days; each title has its own configured fee. Overdue fines are PHP 5.00 per chargeable day after a 2-calendar-day grace period, excluding Sundays and library holidays, capped at PHP 500 per item. At 30 days overdue an item is classified as lost and late-fine accrual stops. Lost and damage charges are staff assessments, not fixed amounts. An unpaid physical fine balance of PHP 100 or more suspends borrowing privileges. Do not state unverified limits, schedules, names, charges, or locations.

Physical library location and service hours: The physical library is on the second floor near the Registrar and Accounting offices. Hours on file are 8:00 AM to 5:00 PM. No weekday, holiday, or special-closure schedule is specified here; do not infer one.

Physical borrowing FAQ: Signed-in students and faculty can browse physical titles, check current availability, and submit a request using a loan term and fee shown for that title. Terms and fees are title-specific; never quote an amount unless it is available for that title. A request does not reserve a copy. Library staff confirms the exact copy and checkout at the circulation desk after checking the member's physical school ID. Physical checkout fees and physical fine payments are cash-only; do not suggest online payment. Staff handles physical checkout, returns, and renewals. Renewal availability and fees depend on the current loan and options; overdue loans or loans with an open incident cannot be renewed. A waitlist notification is not a reservation. Use live libraryPolicy data for current overdue-fine rules and the saved policy snapshot for an existing loan. Lost and damaged item charges are assessed by staff.

Digital access FAQ: Digital access is separate from physical borrowing. It is free or uses the displayed points for the selected duration, and it does not accrue overdue fines.$policy$
)
on conflict (id) do update
set policy_text = case
      when position('Physical library location and service hours:' in current_settings.policy_text) = 0
        then concat_ws(E'\n\n', nullif(trim(current_settings.policy_text), ''), substring(excluded.policy_text from position('Physical library location and service hours:' in excluded.policy_text)))
      else current_settings.policy_text
    end,
    updated_at = case
      when position('Physical library location and service hours:' in current_settings.policy_text) = 0
        then now()
      else current_settings.updated_at
    end;

commit;
