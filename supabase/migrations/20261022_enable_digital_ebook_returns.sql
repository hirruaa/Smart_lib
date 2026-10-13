-- Allow authenticated members to return their own active digital loans through
-- the validated return_digital_loan security-definer function.
grant execute on function public.return_digital_loan(bigint) to authenticated;
