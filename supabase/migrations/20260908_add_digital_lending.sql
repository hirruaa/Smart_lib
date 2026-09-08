-- Digital lending rules for temporary e-book access.
-- The RPC is the authoritative boundary for student loan requests.

ALTER TABLE IF EXISTS public.borrow_requests
  ADD COLUMN IF NOT EXISTS duration_days integer;

UPDATE public.borrow_requests
SET duration_days = GREATEST(1, CEIL(EXTRACT(EPOCH FROM (due_date - request_date)) / 86400)::integer)
WHERE duration_days IS NULL AND due_date IS NOT NULL;

ALTER TABLE IF EXISTS public.borrow_requests
  ALTER COLUMN duration_days SET DEFAULT 14;

ALTER TABLE IF EXISTS public.borrow_requests
  ADD CONSTRAINT borrow_requests_duration_days_valid
  CHECK (duration_days IS NULL OR duration_days BETWEEN 7 AND 90);

CREATE INDEX IF NOT EXISTS idx_borrow_requests_student_status
  ON public.borrow_requests(student_id, status, due_date);

CREATE OR REPLACE FUNCTION public.request_digital_loan(p_book_id bigint, p_duration_days integer)
RETURNS public.borrow_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested public.borrow_requests;
  active_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_duration_days < 7 OR p_duration_days > 90 THEN
    RAISE EXCEPTION 'Choose a lending period between 7 and 90 days';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_book_id::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.books WHERE id = p_book_id) THEN
    RAISE EXCEPTION 'Resource not found';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.borrow_requests
  WHERE student_id = auth.uid()
    AND status = 'approved'
    AND returned_date IS NULL
    AND due_date > now();

  IF active_count >= 3 THEN
    RAISE EXCEPTION 'You have reached the maximum of 3 active digital loans';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.borrow_requests
    WHERE student_id = auth.uid()
      AND book_id = p_book_id
      AND (
        (status = 'pending') OR
        (status = 'approved' AND returned_date IS NULL AND due_date > now())
      )
  ) THEN
    RAISE EXCEPTION 'You already have an active request or loan for this resource';
  END IF;

  INSERT INTO public.borrow_requests(student_id, book_id, status, request_date, duration_days)
  VALUES (auth.uid(), p_book_id, 'pending', now(), p_duration_days)
  RETURNING * INTO requested;

  RETURN requested;
END;
$$;

REVOKE ALL ON FUNCTION public.request_digital_loan(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_digital_loan(bigint, integer) TO authenticated;
