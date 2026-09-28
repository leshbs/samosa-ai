-- The one index the query sites ask for and the schema did not have.
--
-- `analysis_jobs` was indexed by dataset (`dataset_id, created_at desc`) and by
-- dataset+status, but never by organization. Two hot paths filter on
-- organization alone:
--
--   * `listJobs()` selects with no explicit filter and lets RLS add
--     `organization_id in (select current_org_ids())` — which is exactly a
--     filter on organization, followed by `order by created_at desc`. It backs
--     both /analysis and /reports.
--   * `getUsageSummary()` sums tokens and cost across every job of one
--     organization, on the settings page.
--
-- Both were sequential scans over the whole table filtered afterwards. The
-- column order matters: organization first for the equality, created_at second
-- so the sort comes for free.
--
-- Honest caveat: derived from reading every query site, not from an EXPLAIN —
-- the Supabase CLI cannot reach the project without the database password.
-- Worth confirming with `explain analyze` once that access exists.

create index if not exists analysis_jobs_org_created_idx
  on public.analysis_jobs (organization_id, created_at desc);
