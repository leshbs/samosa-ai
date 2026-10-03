-- Non-answers (pilot 01, §3.2 of docs/research/pilot-01-findings.md).
--
-- "tidak ada", "-", "belum ada" mean the respondent gave no aspiration. Until
-- now they were either dropped without a trace (too short to send) or sent to
-- the model and came back "neutral", which put them in the denominator of
-- every sentiment percentage. They now get no result row at all, and the job
-- records how many there were so the report can say "128 dari 140 responden
-- memberikan aspirasi".
--
-- PASTE THIS BEFORE the code that writes the column is deployed: the job
-- runner names it when it finishes a job. Reading is tolerant — jobs from
-- before this migration read as 0.
--
-- Idempotent.

alter table public.analysis_jobs
  add column if not exists no_content_count integer not null default 0;

do $$
begin
  alter table public.analysis_jobs
    add constraint analysis_jobs_no_content_count_check check (no_content_count >= 0);
exception when duplicate_object then null;
end $$;

-- No policy changes: `analysis_jobs` has no write policy, so only the job
-- runner (service role) sets this.
