begin;

-- Faculty choices are managed by administrators. Keep historical profile values
-- intact while allowing the catalog to grow beyond its original two entries.
alter table public.academic_departments
  drop constraint if exists academic_departments_school_choices;

alter table public.profiles
  drop constraint if exists profiles_school_department_choices;

commit;
