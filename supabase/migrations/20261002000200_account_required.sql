-- Every organization has an account (ADR-0012, round 2).
--
-- PASTE THIS ONLY AFTER the code from rounds 1 and 2 is deployed. Older code
-- creates organizations without an account, and with this constraint in place
-- its sign-ups would fail. `20261001000100_accounts.sql` left the column
-- nullable for exactly that reason; this file closes it.
--
-- The backfill is repeated first, for organizations created between the two
-- pastes. Idempotent: safe to paste twice.

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

alter table public.organizations alter column account_id set not null;
