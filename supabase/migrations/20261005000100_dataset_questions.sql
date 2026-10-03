-- Several questions per dataset (pilot 01, §3.5 and §4 of
-- docs/research/pilot-01-findings.md).
--
-- A survey has more than one open question, and until now a dataset could hold
-- one: the header was thrown away at upload and every row was "an aspiration".
-- A dataset now has questions, and a response is one respondent's answer to
-- one of them.
--
-- PASTE THIS BEFORE the code that reads the new columns is deployed. It is
-- safe to paste while the old code is still live: that code inserts responses
-- without naming a question, and the trigger below gives each such row the
-- dataset's default question and the next respondent number. That is also why
-- the two new columns can be NOT NULL from the first paste.
--
-- `analysis_mode` and `detected_mode` are here for round 2 (mode detection);
-- nothing reads them yet, and every question is `evaluative`.
--
-- Idempotent.

create table if not exists public.dataset_questions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  -- Denormalized like every other tenant table: the RLS policy keys on it.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The header as it stood in the uploaded sheet, used to find the column again.
  column_name text not null check (char_length(column_name) between 1 and 200),
  -- What the report prints as the section title. Starts as the header.
  question_text text not null check (char_length(question_text) between 1 and 500),
  analysis_mode text not null default 'evaluative',
  -- The system's guess before anyone corrected it; null when it never guessed.
  detected_mode text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (dataset_id, column_name),
  unique (dataset_id, position)
);

do $$
begin
  alter table public.dataset_questions
    add constraint dataset_questions_analysis_mode_check
    check (analysis_mode in ('evaluative', 'thematic', 'categorical', 'scale', 'segment', 'ignore'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.dataset_questions
    add constraint dataset_questions_detected_mode_check
    check (
      detected_mode is null
      or detected_mode in ('evaluative', 'thematic', 'categorical', 'scale', 'segment', 'ignore')
    );
exception when duplicate_object then null;
end $$;

create index if not exists dataset_questions_org_idx
  on public.dataset_questions (organization_id);

alter table public.dataset_questions enable row level security;

-- Read by members of the workspace. No write policy: questions are written by
-- the upload (service role), like the responses they describe.
drop policy if exists dataset_questions_select on public.dataset_questions;
create policy dataset_questions_select on public.dataset_questions
  for select using (organization_id in (select public.current_org_ids()));

alter table public.responses
  add column if not exists question_id uuid
    references public.dataset_questions (id) on delete cascade;

-- Which row of the uploaded sheet this answer came from: the same number on
-- every answer one respondent gave.
alter table public.responses
  add column if not exists respondent_index integer;

/**
 * Gives a response that names no question the dataset's first one, creating it
 * from the dataset's recorded text column when the dataset has none yet, and
 * numbers a response that names no respondent after the last one stored.
 *
 * A row that names both passes through untouched, which is every row the
 * current upload writes.
 */
create or replace function public.responses_fill_question()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  found uuid;
  header text;
begin
  if new.question_id is null then
    select id into found
    from public.dataset_questions
    where dataset_id = new.dataset_id
    order by position
    limit 1;

    if found is null then
      select coalesce(nullif(metadata ->> 'text_column_name', ''), 'Aspirasi')
      into header
      from public.datasets
      where id = new.dataset_id;

      insert into public.dataset_questions
        (dataset_id, organization_id, column_name, question_text, position)
      values
        (new.dataset_id, new.organization_id, coalesce(header, 'Aspirasi'), coalesce(header, 'Aspirasi'), 0)
      returning id into found;
    end if;

    new.question_id := found;
  end if;

  if new.respondent_index is null then
    select coalesce(max(respondent_index), -1) + 1
    into new.respondent_index
    from public.responses
    where dataset_id = new.dataset_id;
  end if;

  return new;
end $$;

drop trigger if exists responses_fill_question on public.responses;
create trigger responses_fill_question
  before insert on public.responses
  for each row execute function public.responses_fill_question();

-- Backfill: every dataset that exists becomes a dataset with one question.
insert into public.dataset_questions
  (dataset_id, organization_id, column_name, question_text, position)
select
  d.id,
  d.organization_id,
  coalesce(nullif(d.metadata ->> 'text_column_name', ''), 'Aspirasi'),
  coalesce(nullif(d.metadata ->> 'text_column_name', ''), 'Aspirasi'),
  0
from public.datasets d
where not exists (
  select 1 from public.dataset_questions q where q.dataset_id = d.id
);

update public.responses r
set question_id = q.id
from public.dataset_questions q
where r.question_id is null
  and q.dataset_id = r.dataset_id
  and q.position = (
    select min(position) from public.dataset_questions where dataset_id = r.dataset_id
  );

-- The sheet row of an old response cannot be recovered: blank rows were dropped
-- at upload and every row of a dataset shares one timestamp. They are numbered
-- in stored order, which is enough to tell respondents apart.
with numbered as (
  select
    id,
    row_number() over (partition by dataset_id order by created_at, id) - 1 as n
  from public.responses
  where respondent_index is null
)
update public.responses r
set respondent_index = numbered.n
from numbered
where r.id = numbered.id;

alter table public.responses alter column question_id set not null;
alter table public.responses alter column respondent_index set not null;

do $$
begin
  alter table public.responses
    add constraint responses_respondent_index_check check (respondent_index >= 0);
exception when duplicate_object then null;
end $$;

create index if not exists responses_question_idx
  on public.responses (question_id);
create index if not exists responses_dataset_respondent_idx
  on public.responses (dataset_id, respondent_index);

-- Per question: how many answers were analysed, held no aspiration, or failed.
-- { "<question id>": { "analyzed": 127, "no_content": 54, "failed": 0 } }
-- Empty on jobs from before this migration, whose one question reads the job's
-- own counters instead.
alter table public.analysis_jobs
  add column if not exists question_counts jsonb not null default '{}'::jsonb;

-- No policy changes on `analysis_jobs` or `responses`: neither has a write
-- policy, so only the service role sets these.
