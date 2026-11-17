begin;

alter table public.academic_departments
  drop constraint if exists academic_departments_school_choices;
alter table public.profiles
  drop constraint if exists profiles_school_department_choices;

insert into public.academic_departments (name, is_active)
values
  ('BSBA', true),
  ('BSA', true),
  ('BSTM', true),
  ('BSHM', true),
  ('BSCRIM', true)
on conflict (lower(name)) do update
set is_active = excluded.is_active;

commit;
