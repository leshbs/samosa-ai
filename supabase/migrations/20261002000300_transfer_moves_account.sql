-- Handing a workspace over also hands over what is billed for it
-- (ADR-0012, round 3).
--
-- The plan lives on the account, and the account has one owner. Until now a
-- transfer swapped the two roles and left the workspace on the old owner's
-- account: they stayed billed for something that was no longer theirs, and it
-- kept using up the one workspace their plan gives them.
--
-- Only the account's *only* workspace takes the account with it. Someone who
-- owns three and hands over one keeps the account, and that workspace stays on
-- it — it is still theirs to pay for.
--
-- Same signature as before, so `create or replace` is enough. Safe to paste
-- before or after the code that goes with it, and safe to paste twice.

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account uuid;
  v_recipient_account uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.has_org_role(p_organization_id, array['owner']::public.org_role[]) then
    raise exception 'not_owner';
  end if;
  if p_new_owner = v_uid then
    raise exception 'same_user';
  end if;

  update public.organization_members
    set role = 'owner'
    where organization_id = p_organization_id and user_id = p_new_owner;
  if not found then
    raise exception 'not_a_member';
  end if;

  update public.organization_members
    set role = 'admin'
    where organization_id = p_organization_id and user_id = v_uid;

  -- The account follows only when the caller owns it and this is all it holds.
  select o.account_id into v_account
  from public.organizations o
  join public.accounts a on a.id = o.account_id
  where o.id = p_organization_id
    and a.owner_id = v_uid
    and not exists (
      select 1 from public.organizations other
      where other.account_id = o.account_id and other.id <> o.id
    );

  if v_account is null then
    return;
  end if;

  select a.id into v_recipient_account
  from public.accounts a
  where a.owner_id = p_new_owner;

  if v_recipient_account is null then
    -- The account changes hands whole, so the plan travels with the workspace.
    update public.accounts
      set owner_id = p_new_owner, updated_at = now()
      where id = v_account;
  else
    -- One account per person: the recipient already has one, so the workspace
    -- joins it and comes under its plan. The old account stays with the old
    -- owner, empty, ready for their next workspace.
    update public.organizations
      set account_id = v_recipient_account
      where id = p_organization_id;
  end if;
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;
