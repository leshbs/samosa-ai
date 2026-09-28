-- Realtime for analysis_jobs, so a finished report refreshes itself.
--
-- The report page is a Server Component: without a push the only way a reader
-- learns that a re-run finished is to reload by hand, and a stale dashboard is
-- worse than an empty one because it looks current.
--
-- RLS still applies. Realtime evaluates the subscriber's own policies before
-- it forwards a row, so a member of another organization receives nothing --
-- this publication widens what is streamed, never who may read it.
--
-- Written to be idempotent and safe to run anywhere: `alter publication ...
-- add table` throws if the table is already a member, and `supabase_realtime`
-- is created by Supabase rather than by this repo, so neither its presence nor
-- its contents can be assumed. That matters because this file is as likely to
-- be pasted into the SQL Editor as it is to arrive through `supabase db push`.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'analysis_jobs'
  ) then
    alter publication supabase_realtime add table public.analysis_jobs;
  end if;
end $$;

-- Realtime needs the primary key in the payload of an UPDATE to identify the
-- row; the default replica identity already supplies it, and we deliberately
-- do not switch to FULL, which would stream every column of every change.
