-- Analysis modes (pilot 01, §4 of docs/research/pilot-01-findings.md; ADR-0016).
--
-- "Kegiatan apa yang paling seru?" has no sentiment in it, and a result row had
-- to carry one: `sentiment` and `sentiment_confidence` were NOT NULL, so every
-- answer to such a question came back "neutral". From analysis.v3 a question
-- has a mode, and only an `evaluative` question is given a sentiment. The rows
-- of the others store none.
--
-- PASTE THIS BEFORE the code that writes such rows is deployed. It is safe to
-- paste while the old code is still live: that code always writes both columns,
-- and dropping NOT NULL refuses nothing it does.
--
-- No new column. A row's `topics` holds what its question's mode counts: topics
-- for `evaluative` and `thematic`, the choice(s) named for `categorical`, the
-- value given for `scale`. Which mode a job used for a question is recorded on
-- the job, in `analysis_jobs.question_counts`, beside that question's counts.
--
-- Idempotent.

alter table public.analysis_results alter column sentiment drop not null;
alter table public.analysis_results alter column sentiment_confidence drop not null;

-- A confidence describes a sentiment, so a row has both or neither.
do $$
begin
  alter table public.analysis_results
    add constraint analysis_results_sentiment_pair_check
    check ((sentiment is null) = (sentiment_confidence is null));
exception when duplicate_object then null;
end $$;
