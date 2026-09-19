-- RLS for every tenant-scoped table. Writes go through the service-role client
-- in background jobs, so most tables grant read-only access to members and keep
-- mutations server-side where the auth module has already checked permissions.

-- security definer avoids recursive RLS evaluation when a policy on
-- organization_members would itself need to read organization_members.
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid()
$$;

create or replace function public.has_org_role(target_org uuid, roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where user_id = auth.uid()
      and organization_id = target_org
      and role = any (roles)
  )
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.datasets enable row level security;
alter table public.responses enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.analysis_results enable row level security;
alter table public.reports enable row level security;

create policy organizations_select on public.organizations
  for select using (id in (select public.current_org_ids()));

create policy organizations_update on public.organizations
  for update using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

create policy members_select on public.organization_members
  for select using (organization_id in (select public.current_org_ids()));

create policy members_manage on public.organization_members
  for all
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy datasets_select on public.datasets
  for select using (organization_id in (select public.current_org_ids()));

create policy datasets_insert on public.datasets
  for insert
  with check (
    uploader_id = auth.uid()
    and public.has_org_role(
      organization_id,
      array['owner', 'admin', 'member']::public.org_role[]
    )
  );

create policy datasets_delete on public.datasets
  for delete using (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

create policy responses_select on public.responses
  for select using (organization_id in (select public.current_org_ids()));

create policy analysis_jobs_select on public.analysis_jobs
  for select using (organization_id in (select public.current_org_ids()));

create policy analysis_results_select on public.analysis_results
  for select using (organization_id in (select public.current_org_ids()));

create policy reports_select on public.reports
  for select using (organization_id in (select public.current_org_ids()));
