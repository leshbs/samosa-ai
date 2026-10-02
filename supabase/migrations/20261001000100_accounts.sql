-- Accounts: the billing unit above organizations (ADR-0012, round 1).
--
-- An account has one owner and holds the plan; an organization belongs to one
-- account. Nothing about access changes here: `organizations` is still the
-- isolation unit, `current_org_ids()` is still what every policy reads, and no
-- policy looks at the plan. Plan limits are enforced in services.
--
-- `organizations.account_id` stays nullable in this migration on purpose. This
-- file is pasted into the SQL Editor by hand, at some point before or after
-- the code that fills the column is deployed; a NOT NULL here would break
-- sign-up for whoever arrives in between. Code treats a missing account as the
-- free plan. The constraint follows once nothing can create an organization
-- without one.
--
-- Idempotent: safe to paste twice.

do $$
begin
  create type public.account_plan as enum ('free', 'org', 'enterprise');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: deleting a person must not delete what their organization owes,
  -- and an organization nobody owns still needs a plan to resolve.
  owner_id uuid references auth.users (id) on delete set null,
  plan public.account_plan not null default 'free',
  -- Per-account overrides of the plan defaults in lib/plans.ts.
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One account per person. Provisioning looks the account up by owner, so a
-- second one would make "which plan am I on" ambiguous.
create unique index if not exists accounts_owner_key
  on public.accounts (owner_id)
  where owner_id is not null;

alter table public.organizations
  add column if not exists account_id uuid references public.accounts (id) on delete restrict;

create index if not exists organizations_account_idx
  on public.organizations (account_id);

-- ── Backfill ──────────────────────────────────────────────────────────────
-- One account per existing owner, holding every organization they own.

insert into public.accounts (owner_id)
select distinct m.user_id
from public.organization_members m
join public.organizations o on o.id = m.organization_id
where m.role = 'owner'
  and o.account_id is null
  and not exists (select 1 from public.accounts a where a.owner_id = m.user_id);

update public.organizations o
set account_id = a.id
from public.organization_members m
join public.accounts a on a.owner_id = m.user_id
where m.organization_id = o.id
  and m.role = 'owner'
  and o.account_id is null;

-- An organization with no owner row still gets an account, with no owner.
do $$
declare
  v_org uuid;
  v_account uuid;
begin
  for v_org in select id from public.organizations where account_id is null loop
    insert into public.accounts (owner_id) values (null) returning id into v_account;
    update public.organizations set account_id = v_account where id = v_org;
  end loop;
end
$$;

-- ── Access ────────────────────────────────────────────────────────────────
-- Readable by the owner and by members of the account's organizations (the
-- settings page shows the plan). Written only by the service role: a plan is
-- changed by hand during the pilot, never from a browser.

alter table public.accounts enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select using (
    owner_id = auth.uid()
    or id in (
      select o.account_id
      from public.organizations o
      where o.id in (select public.current_org_ids())
    )
  );

revoke all on public.accounts from anon, authenticated;
grant select on public.accounts to authenticated;
