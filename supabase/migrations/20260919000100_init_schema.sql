-- SAMOSA initial schema.
-- Every tenant-scoped table carries organization_id so RLS can filter on a
-- single indexed column instead of walking joins on every request.

create extension if not exists "pgcrypto";

create type public.sentiment as enum ('positive', 'neutral', 'negative');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.dataset_source as enum ('csv', 'xlsx', 'google_forms', 'manual');
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index organization_members_org_idx on public.organization_members (organization_id);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  uploader_id uuid not null references auth.users (id),
  name text not null check (char_length(name) between 1 and 120),
  source public.dataset_source not null,
  storage_path text,
  response_count integer not null default 0 check (response_count >= 0),
  created_at timestamptz not null default now()
);

create index datasets_org_idx on public.datasets (organization_id, created_at desc);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  respondent_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index responses_dataset_idx on public.responses (dataset_id);
create index responses_org_idx on public.responses (organization_id);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  status public.job_status not null default 'queued',
  prompt_version text not null,
  model_id text,
  processed_count integer not null default 0 check (processed_count >= 0),
  total_count integer not null default 0 check (total_count >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index analysis_jobs_dataset_idx on public.analysis_jobs (dataset_id, created_at desc);
-- Partial index: the worker only ever scans for work that is still pending.
create index analysis_jobs_pending_idx on public.analysis_jobs (created_at)
  where status in ('queued', 'running');

create table public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.analysis_jobs (id) on delete cascade,
  response_id uuid not null references public.responses (id) on delete cascade,
  sentiment public.sentiment not null,
  sentiment_confidence numeric(4, 3) not null check (sentiment_confidence between 0 and 1),
  topics text[] not null default '{}',
  keywords text[] not null default '{}',
  summary text,
  -- Pinned per row: a later prompt revision must not rewrite past results.
  prompt_version text not null,
  model_id text not null,
  created_at timestamptz not null default now(),
  unique (job_id, response_id)
);

create index analysis_results_job_idx on public.analysis_results (job_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null unique references public.analysis_jobs (id) on delete cascade,
  summary text not null default '',
  insights jsonb not null default '[]'::jsonb,
  exported_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_org_idx on public.reports (organization_id, created_at desc);
