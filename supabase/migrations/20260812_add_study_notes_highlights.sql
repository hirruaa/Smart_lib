-- Study notes and highlights for E-Study Room

-- study_notes: textual notes attached to a book + page
CREATE TABLE IF NOT EXISTS public.study_notes (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  book_id bigint NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page integer,
  text text,
  selection_text text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- highlights: geometry/rects for page highlights, color, optional linked note
CREATE TABLE IF NOT EXISTS public.highlights (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  book_id bigint NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page integer NOT NULL,
  rects jsonb NOT NULL, -- array of {x,y,w,h} relative coords
  color text DEFAULT 'yellow',
  note_id bigint NULL REFERENCES public.study_notes(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS and policies: owners or admins (based on profiles.role)
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Helper policy expression: user is owner OR has profile role 'admin'
-- Policy for study_notes
CREATE POLICY study_notes_owner_or_admin ON public.study_notes
  USING ( user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') )
  WITH CHECK ( user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') );

-- Policy for highlights
CREATE POLICY highlights_owner_or_admin ON public.highlights
  USING ( user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') )
  WITH CHECK ( user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') );

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_study_notes_touch ON public.study_notes;
CREATE TRIGGER trg_study_notes_touch
BEFORE UPDATE ON public.study_notes
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
