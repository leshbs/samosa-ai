-- Topic merge (C.5, ADR-0018, docs/research/prompt-comparison-01.md).
--
-- Topic labels are written one answer at a time, so one idea arrives under
-- several names: "kepercayaan diri" (49) and "percaya diri" (15) were counted
-- as two topics, which put a value with 64 mentions behind one with 49. When
-- a job finishes it now records which labels it counts as one topic:
--
--   { "prompt_version": "merge.v1",
--     "questions": { "<question id>": { "percaya diri": "kepercayaan diri" } } }
--
-- A layer, not a rewrite: `analysis_results.topics` keeps every label as the
-- model gave it, and a report is drawn by reading those labels through this
-- column. `{}` means nothing is merged, which is every job from before this.
--
-- PASTE THIS BEFORE the code that writes the column is deployed. The job
-- runner writes it in a statement of its own, so on a database without the
-- column a job still finishes — but its report has nothing merged.
--
-- Idempotent.

alter table public.analysis_jobs
  add column if not exists topic_merges jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.analysis_jobs
    add constraint analysis_jobs_topic_merges_check
    check (jsonb_typeof(topic_merges) = 'object');
exception when duplicate_object then null;
end $$;

-- No policy changes: `analysis_jobs` has no write policy, so only the job
-- runner (service role) sets this.
