-- Phase 2 needs two things the initial schema did not carry: what a job cost,
-- and a way to say "some batches failed but the results we have are good".

-- A job whose batches partly failed is neither succeeded nor failed. Without
-- this the runner has to lie in one direction or the other.
alter type public.job_status add value if not exists 'partial' after 'succeeded';

alter table public.analysis_jobs
  add column input_tokens integer not null default 0 check (input_tokens >= 0),
  add column output_tokens integer not null default 0 check (output_tokens >= 0),
  -- Micro-rupiah: an integer avoids float drift when summing thousands of
  -- batches, and one response costs a fraction of a rupiah.
  add column cost_micro_idr bigint not null default 0 check (cost_micro_idr >= 0),
  add column failed_count integer not null default 0 check (failed_count >= 0);

comment on column public.analysis_jobs.cost_micro_idr is
  'Estimated spend in millionths of IDR, derived from token usage at job time.';

-- The job list and the worker both filter by dataset and status together.
create index analysis_jobs_dataset_status_idx
  on public.analysis_jobs (dataset_id, status);
