begin;

-- Link to OpenStax's publisher-hosted PDFs; do not copy or charge for the texts.
insert into public.books (
  title, author, category, discipline, source_type, description,
  pdf_url, storage_provider, mime_type, catalog_type,
  access_mode, access_points, access_costs
)
select
  seed.title,
  seed.author,
  seed.category,
  seed.category,
  'catalog',
  'OpenStax open textbook. Licensed under CC BY-NC-SA 4.0. Free official PDF from the publisher.'
    || case when seed.note is null then '' else ' ' || seed.note end,
  seed.pdf_url,
  'external',
  'application/pdf',
  'digital',
  'free',
  0,
  '{}'::jsonb
from (values
  ('College Algebra 2e', 'Jay Abramson', 'Math', 'https://assets.openstax.org/oscms-prodcms/media/documents/college-algebra-2e_-_WEB.pdf', null),
  ('Biology 2e', 'Mary Ann Clark; Matthew Douglas; Jung Choi', 'Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/Biology-2e_-_WEB.pdf', null),
  ('Chemistry 2e', 'Paul Flowers; Klaus Theopold; Richard Langley', 'Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/chemistry-2e_-_WEB.pdf', null),
  ('College Physics 2e', 'Paul Peter Urone; Roger Hinrichs', 'Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/college-physics-2e_-_WEB.pdf', null),
  ('American Government 4e', 'Glen Krutz; Sylvie Waskiewicz, PhD', 'Social Sciences', 'https://assets.openstax.org/oscms-prodcms/media/documents/American_Government_4e_-_WEB_eM2Tuqh.pdf', 'U.S.-focused civics text; use as a comparative reference.'),
  ('Introduction to Sociology 3e', 'Tonja R. Conerly; Kathleen Holmes; Asha Lal Tamang', 'Social Sciences', 'https://assets.openstax.org/oscms-prodcms/media/documents/introduction-sociology-3e_-_WEB.pdf', null),
  ('Psychology 2e', 'Rose M. Spielman; William J. Jenkins; Marilyn D. Lovett', 'Social Sciences', 'https://assets.openstax.org/oscms-prodcms/media/documents/Psychology2e_WEB.pdf', null),
  ('Writing Guide with Handbook', 'Michelle Bachelor Robinson; Maria Jerskey; featuring Toby Fulwiler', 'Humanities', 'https://assets.openstax.org/oscms-prodcms/media/documents/WritingGuide-WEB.pdf', null),
  ('Introduction to Business 2e', 'Lawrence J. Gitman; Carl McDaniel; Amit Shah', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/Introduction_to_Business_2e_-_WEB.pdf', null),
  ('Principles of Accounting, Volume 1: Financial Accounting', 'Mitchell Franklin; Patty Graybeal; Dixon Cooper', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/principles-financial-accounting_-_WEB.pdf', null),
  ('Principles of Accounting, Volume 2: Managerial Accounting', 'Mitchell Franklin; Patty Graybeal; Dixon Cooper', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/principles-managerial-accounting_-_WEB.pdf', null),
  ('Introductory Business Statistics 2e', 'Alexander Holmes; Barbara Illowsky; Susan Dean', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/introductory-business-statistics-2e_-_WEB.pdf', null),
  ('Business Ethics', 'Stephen M. Byars; Kurt Stanberry', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/business-ethics_-_WEB.pdf', null),
  ('Business Law I Essentials 2e', 'Mirande Valbrune; Renee De Assis', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/Business_Law_I_Essentials_2e_-_WEB.pdf', 'U.S.-focused business law text; use as a comparative reference.'),
  ('Entrepreneurship', 'Michael Laverty; Chris Littel', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/Entrepreneurship-WEB.pdf', null),
  ('Principles of Economics 3e', 'Steven A. Greenlaw; David Shapiro; Daniel MacDonald', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/principles-economics-3e_-_WEB.pdf', null),
  ('Organizational Behavior', 'J. Stewart Black; David S. Bright', 'Business', 'https://assets.openstax.org/oscms-prodcms/media/documents/organizational-behavior_-_WEB.pdf', null),
  ('Introduction to Computer Science', 'Dr. Jean-Claude Franchitti', 'Computer Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/Introduction_To_Computer_Science_-_WEB.pdf', null),
  ('Introduction to Python Programming', 'Udayan Das; Aubrey Lawson; Chris Mayfield', 'Computer Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/Introduction_to_Python_Programming-WEB.pdf', null),
  ('Principles of Data Science', 'Dr. Shaun V. Ault; Dr. Soohyun Nam Liao; Larry Musolino', 'Computer Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/Principles-of-Data-Science-WEB.pdf', null),
  ('Anatomy and Physiology 2e', 'J. Gordon Betts; Kelly A. Young; James A. Wise', 'Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/anatomy-and-physiology-2e_-_WEB.pdf', null),
  ('Maternal-Newborn Nursing', 'Amy Giles; Regina Prusinski; Laura Wallace', 'Nursing', 'https://assets.openstax.org/oscms-prodcms/media/documents/Maternal-Newborn_Nursing-WEB.pdf', null),
  ('Fundamentals of Nursing', 'Christy Bowen; Lindsay Draper; Heather Moore', 'Nursing', 'https://assets.openstax.org/oscms-prodcms/media/documents/Fundamentals_of_Nursing_-_WEB.pdf', null),
  ('Nutrition for Nurses', 'Emerald Charity Bilbrew; Jody Vogelzang; Kelli Whittington', 'Nursing', 'https://assets.openstax.org/oscms-prodcms/media/documents/Nutrition_for_Nurses-WEB.pdf', null),
  ('Introduction to Political Science', 'Mark Carl Rom; Masaki Hidaka; Rachel Bzostek Walker', 'Social Sciences', 'https://assets.openstax.org/oscms-prodcms/media/documents/Introduction_to_Political_Science_-_WEB.pdf', null),
  ('Lifespan Development', 'Diana Riser; Rose Spielman; David Biek', 'Social Sciences', 'https://assets.openstax.org/oscms-prodcms/media/documents/Lifespan_Development_-_WEB.pdf', null),
  ('Microbiology', 'Nina Parker; Mark Schneegurt; Anh-Hue Thi Tu', 'Science', 'https://assets.openstax.org/oscms-prodcms/media/documents/microbiology_-_WEB.pdf', null)
) as seed(title, author, category, pdf_url, note)
where not exists (
  select 1
  from public.books existing
  where lower(trim(existing.title)) = lower(trim(seed.title))
);

commit;
