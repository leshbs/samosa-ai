-- Rate limiting for the endpoints that cost money or storage.
--
-- Postgres rather than Redis: every request already opens a Supabase
-- connection, so this adds a vendor-free counter instead of a second data
-- store. An in-process counter would be worthless here — serverless functions
-- do not share memory, so each cold start would hand out a fresh allowance.
--
-- The trade-off is one extra round trip per guarded request. At the volumes
-- this app sees (a school organisation uploading a few datasets a week) that
-- is far cheaper than an Upstash account to administer.

create table if not exists public.rate_limits (
  -- "<action>:<organization_id>" — the caller builds it, this table never parses it.
  bucket text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);

-- No policies on purpose: with RLS on and nothing granted, only the service
-- role can read or write this table. A member must never be able to reset
-- their own counter.
alter table public.rate_limits enable row level security;

/**
 * Counts one request against a bucket and says whether it is allowed.
 *
 * Fixed window, not sliding: a burst at a window boundary can briefly reach
 * twice the limit. That is acceptable for abuse control, and the alternative
 * (a row per request) makes the table grow without bound.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expired timestamptz := now() - make_interval(secs => p_window_seconds);
  v_start timestamptz;
  v_count integer;
begin
  -- One statement, so two concurrent requests cannot both read a stale count.
  insert into public.rate_limits as existing (bucket, window_start, request_count)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update
    set request_count =
          case when existing.window_start < v_expired then 1
               else existing.request_count + 1 end,
        window_start =
          case when existing.window_start < v_expired then v_now
               else existing.window_start end
  returning existing.window_start, existing.request_count
  into v_start, v_count;

  return query
    select
      v_count <= p_limit,
      greatest(p_limit - v_count, 0),
      v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, integer, integer) from authenticated;

-- Lets a periodic cleanup drop windows nobody is inside any more.
create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);
