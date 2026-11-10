begin;

alter table public.point_transactions
  drop constraint if exists point_transactions_transaction_type_check;

alter table public.point_transactions
  add constraint point_transactions_transaction_type_check
  check (transaction_type in (
    'contribution_reward',
    'contribution_royalty',
    'access_unlock',
    'admin_adjustment',
    'cash_topup'
  ));

commit;
