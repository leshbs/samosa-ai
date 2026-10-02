-- Joining adds, leaving is allowed (ADR-0012, round 2).
--
-- Until now a person could be in one organization, so accepting an invitation
-- had to *move* them: their own empty organization was deleted, and one with
-- data refused the invitation (`membership_conflict`). Both are gone. Accepting
-- inserts a membership and touches nothing else, unless the caller names a
-- workspace they are leaving in exchange.
--
-- "One owned plus one joined" is a product rule and lives in the auth module,
-- not here: the schema has always allowed any number of memberships.
--
-- Safe to paste before or after the code that uses it, and safe to paste twice.

-- ─── Leaving ──────────────────────────────────────────────────────────────

-- Your own row, unless you own the workspace: an owner hands it over or
-- deletes it first, so a workspace is never left with nobody in charge.
drop policy if exists members_leave on public.organization_members;
create policy members_leave on public.organization_members
  for delete
  using (user_id = auth.uid() and role <> 'owner');

-- ─── Accepting ────────────────────────────────────────────────────────────

-- The return type changes, which `create or replace` cannot do.
drop function if exists public.accept_organization_invitation(text);
drop function if exists public.accept_organization_invitation(text, uuid);

/**
 * Joins the caller to the organization an invitation names.
 *
 * `p_leave_organization_id` is the workspace the caller gives up in the same
 * transaction, so there is no moment where they have left one and failed to
 * join the other. It only ever removes the caller's own non-owner membership:
 * no organization and no data is deleted on any path through this function.
 *
 * Errors are raised as short codes the auth module maps to Indonesian copy.
 */
create function public.accept_organization_invitation(
  p_token_hash text,
  p_leave_organization_id uuid default null
)
returns table (joined_organization_id uuid, left_organization_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.organization_invitations%rowtype;
  v_left uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_invite
  from public.organization_invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_invite.accepted_at is not null then
    -- Opening the link twice is not an error for the person it was for.
    if v_invite.accepted_by = v_uid then
      return query select v_invite.organization_id, null::uuid;
      return;
    end if;
    raise exception 'invitation_used';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'invitation_revoked';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invitation_expired';
  end if;
  if v_email is distinct from v_invite.email then
    raise exception 'invitation_email_mismatch';
  end if;

  -- Already a member: the invitation is spent, the role they have stays.
  if exists (
    select 1 from public.organization_members m
    where m.user_id = v_uid and m.organization_id = v_invite.organization_id
  ) then
    update public.organization_invitations
      set accepted_at = now(), accepted_by = v_uid
      where id = v_invite.id;
    return query select v_invite.organization_id, null::uuid;
    return;
  end if;

  if p_leave_organization_id is not null
    and p_leave_organization_id <> v_invite.organization_id
  then
    if exists (
      select 1 from public.organization_members m
      where m.user_id = v_uid
        and m.organization_id = p_leave_organization_id
        and m.role = 'owner'
    ) then
      raise exception 'owner_cannot_leave';
    end if;

    delete from public.organization_members m
      where m.user_id = v_uid and m.organization_id = p_leave_organization_id;
    if found then
      v_left := p_leave_organization_id;
    end if;
  end if;

  insert into public.organization_members (user_id, organization_id, role)
  values (v_uid, v_invite.organization_id, v_invite.role);

  update public.organization_invitations
    set accepted_at = now(), accepted_by = v_uid
    where id = v_invite.id;

  return query select v_invite.organization_id, v_left;
end;
$$;

revoke all on function public.accept_organization_invitation(text, uuid) from public, anon;
grant execute on function public.accept_organization_invitation(text, uuid) to authenticated;

-- ─── Names that outlive a membership ──────────────────────────────────────

-- A report says who ran it. Once people can leave, "members of my
-- organization" no longer covers that person, and the line would go blank on
-- every analysis they left behind. So a profile is also readable by the
-- members of a workspace its owner ran an analysis in.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    user_id = auth.uid()
    or public.shares_organization_with(user_id)
    or exists (
      select 1
      from public.analysis_jobs j
      where j.created_by = profiles.user_id
        and j.organization_id in (select public.current_org_ids())
    )
  );
