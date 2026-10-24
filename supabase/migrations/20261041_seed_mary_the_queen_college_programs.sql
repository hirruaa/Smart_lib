begin;

-- Seed the college programs published by Mary the Queen College of Quezon City.
-- Administrators can add, deactivate, or rename choices in Academic Catalogs.
insert into public.academic_courses (name, is_active)
select program.name, true
from (values
  ('Bachelor of Elementary Education'),
  ('Bachelor of Secondary Education - English'),
  ('Bachelor of Secondary Education - Filipino'),
  ('Bachelor of Secondary Education - Mathematics'),
  ('Bachelor of Secondary Education - Science'),
  ('Bachelor of Secondary Education - Social Studies'),
  ('BS Accountancy'),
  ('BSCS'),
  ('BS Business Administration - Business Economics'),
  ('BS Business Administration - Finance Management'),
  ('BS Business Administration - Human Resource Development Management'),
  ('BS Business Administration - Marketing Management'),
  ('BS Business Administration - Operations Management'),
  ('BS Computer Engineering'),
  ('BS Criminology'),
  ('BS Hotel and Restaurant Management'),
  ('BSIT'),
  ('BS Psychology'),
  ('BS Tourism Management'),
  ('Diploma in Midwifery')
) as program(name)
where not exists (
  select 1 from public.academic_courses existing
  where lower(trim(existing.name)) = lower(trim(program.name))
)
on conflict (name) do nothing;

commit;
