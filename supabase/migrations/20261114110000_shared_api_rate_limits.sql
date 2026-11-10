begin;

create table if not exists public.api_rate_limit_buckets (
  scope text not null check (scope ~ '^[a-z0-9-]{1,100}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null check (request_count > 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

create index if not exists api_rate_limit_buckets_reset_at_idx
  on public.api_rate_limit_buckets(reset_at);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on public.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_scope is null or p_scope !~ '^[a-z0-9-]{1,100}$'
    or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit is null or p_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into public.api_rate_limit_buckets as bucket(scope, key_hash, request_count, reset_at, updated_at)
  values (p_scope, p_key_hash, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (scope, key_hash) do update
  set request_count = case when bucket.reset_at <= v_now then 1 else bucket.request_count + 1 end,
      reset_at = case when bucket.reset_at <= v_now
        then v_now + make_interval(secs => p_window_seconds)
        else bucket.reset_at
      end,
      updated_at = v_now
  returning bucket.request_count, bucket.reset_at into v_count, v_reset_at;

  if mod(abs(hashtext(p_key_hash)::bigint), 128) = 0 then
    delete from public.api_rate_limit_buckets
    where reset_at < v_now - interval '1 day';
  end if;

  return query
  select v_count <= p_limit,
    greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

commit;
