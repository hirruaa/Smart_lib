-- Allow authenticated users to create their own student profile when needed.
-- Clients cannot use this policy to create an admin profile.

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;

CREATE POLICY profiles_insert_self ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND role = 'student');