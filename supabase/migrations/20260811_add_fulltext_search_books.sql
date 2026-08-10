-- Add tsvector column, trigger, GIN index and search RPC for books

ALTER TABLE IF EXISTS public.books
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE public.books SET search_vector =
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category::text,''));

-- Create trigger to keep search_vector up to date
CREATE OR REPLACE FUNCTION public.books_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.category::text,''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_books_search_vector ON public.books;
CREATE TRIGGER trg_books_search_vector
BEFORE INSERT OR UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.books_search_vector_trigger();

-- GIN index for fast search
CREATE INDEX IF NOT EXISTS idx_books_search_vector ON public.books USING GIN(search_vector);

-- RPC function to search books by query using plainto_tsquery and ranking
CREATE OR REPLACE FUNCTION public.search_books(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE(id bigint, title text, author text, category text, description text, pdf_url text, available_copies int, rank double precision) AS $$
BEGIN
  RETURN QUERY
  SELECT b.id, b.title, b.author, b.category, b.description, b.pdf_url, b.available_copies,
         ts_rank(b.search_vector, q) as rank
  FROM public.books b,
       plainto_tsquery('english', p_query) q
  WHERE b.search_vector @@ q
  ORDER BY rank DESC
  LIMIT p_limit;
END; $$ LANGUAGE plpgsql STABLE;
