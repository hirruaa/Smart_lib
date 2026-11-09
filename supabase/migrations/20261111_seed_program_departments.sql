begin;

-- Make every active academic program available as a faculty department choice.
insert into public.academic_departments (name, is_active)
select name, true
from public.academic_courses
where is_active
on conflict (lower(name)) do update
set is_active = excluded.is_active;

commit;
