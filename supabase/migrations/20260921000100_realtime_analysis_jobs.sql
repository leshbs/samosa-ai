-- Realtime for analysis_jobs, so a finished report refreshes itself.
--
-- The report page is a Server Component: without a push the only way a reader
-- learns that a re-run finished is to reload by hand, and a stale dashboard is
-- worse than an empty one because it looks current.
--
-- RLS still applies. Realtime evaluates the subscriber's own policies before
-- it forwards a row, so a member of another organization receives nothing —
-- this publication widens what is streamed, never who may read it.

alter publication supabase_realtime add table public.analysis_jobs;

-- Realtime needs the primary key in the payload of an UPDATE to identify the
-- row; the default replica identity already supplies it, and we deliberately
-- do not switch to FULL, which would stream every column of every change.
