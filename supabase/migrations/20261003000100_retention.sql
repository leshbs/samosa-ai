-- Retention (ADR-0012, round 4).
--
-- A dataset on a plan with a retention period is warned about, then archived,
-- then — 90 days after that — deleted. Nothing here decides *when*: the period
-- comes from the account's plan (lib/plans.ts), and the daily sweep does the
-- arithmetic. These columns only hold the state the sweep cannot recompute.
--
-- PASTE THIS BEFORE the code that reads the columns is deployed. It only adds
-- columns with defaults, so the code that is live today does not notice.
--
-- The clock for data that already exists starts now, when this is pasted, not
-- when it was uploaded: nobody agreed to a retention period on the day they
-- uploaded. Idempotent — a second paste does not restart any clock.

alter table public.datasets
  -- When this dataset's retention period began. Upload time for new datasets;
  -- for older ones, the moment this migration first ran.
  add column if not exists retention_clock_at timestamptz not null default now(),
  -- Set by the sweep. An archived dataset is hidden from every page but still
  -- part of the export, and comes back if the account moves to a plan that
  -- keeps data.
  add column if not exists archived_at timestamptz,
  -- How far the owner has been told: 0 nothing, 1 the 30-day notice, 2 the
  -- 7-day notice, 3 "it is archived". The sweep only moves a dataset forward
  -- after the email for that step was actually sent.
  add column if not exists retention_stage smallint not null default 0,
  add column if not exists retention_notified_at timestamptz;

do $$
begin
  alter table public.datasets
    add constraint datasets_retention_stage_check check (retention_stage between 0 and 3);
exception when duplicate_object then null;
end $$;

-- Reports follow their dataset into the archive. Kept on the job as well so
-- that hiding them is one filter, not a join on every list.
alter table public.analysis_jobs
  add column if not exists archived_at timestamptz;

-- The sweep reads live datasets oldest clock first, and archived ones.
create index if not exists datasets_retention_clock_idx
  on public.datasets (retention_clock_at)
  where archived_at is null;

create index if not exists datasets_archived_idx
  on public.datasets (archived_at)
  where archived_at is not null;

-- No policy changes. `datasets` has no update policy and `analysis_jobs` has
-- no write policy at all, so nothing a browser can send resets a clock or
-- un-archives a row; the sweep runs with the service role.
