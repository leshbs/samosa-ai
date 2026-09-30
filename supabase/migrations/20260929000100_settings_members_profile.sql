-- Settings, members and profile (checklist 5.x).
--
-- Written to be pasted into the SQL Editor as readily as it arrives through
-- `supabase db push`: every statement is idempotent, so running the file a
-- second time is a no-op rather than an error halfway through.
--
-- Three rules shape everything below:
--
--   1. A user belongs to exactly one organization. `getSessionUser()` has
--      always assumed it; invitations are the first thing that could break it,
--      so the only way into a second organization is a function that enforces
--      it (accept_organization_invitation).
--   2. Nobody changes their own authority. Membership rows can be edited by an
--      owner or admin, but never the owner's row and never *into* an owner row;
--      ownership moves only through transfer_organization_ownership.
--   3. Paths into storage are written by the server, never by the browser.
--      Column privileges keep `logo_path` and `avatar_path` out of reach of the
--      anon key, so a crafted PATCH cannot point one tenant's logo at another
--      tenant's file and have the server sign it.

-- ─── Organization settings ────────────────────────────────────────────────

alter table public.organizations
  add column if not exists logo_path text,
  add column if not exists timezone text not null default 'Asia/Jakarta',
  add column if not exists report_include_quotes boolean not null default true,
  add column if not exists report_include_topic_tail boolean not null default false,
  add column if not exists report_include_provenance boolean not null default true;

do $$
begin
  alter table public.organizations
    add constraint organizations_timezone_check
    check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'));
exception when duplicate_object then null;
end $$;

comment on column public.organizations.timezone is
  'IANA zone for every date the app prints: WIB, WITA or WIT.';

-- Owner only, matching can(role, 'org:manage'). The old policy also let admins
-- in, which the route never did — two rules that disagreed (docs/DEBT.md).
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update
  using (public.has_org_role(id, array['owner']::public.org_role[]))
  with check (public.has_org_role(id, array['owner']::public.org_role[]));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete using (public.has_org_role(id, array['owner']::public.org_role[]));

revoke update on public.organizations from anon, authenticated;
grant update (
  name,
  timezone,
  report_include_quotes,
  report_include_topic_tail,
  report_include_provenance
) on public.organizations to authenticated;

-- ─── Membership ───────────────────────────────────────────────────────────

-- `members_manage` was `for all` to owner and admin: an admin could update
-- their own row to 'owner', or delete the owner's. Latent while every
-- organization had one member; live the moment invitations exist.
drop policy if exists members_manage on public.organization_members;

drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members
  for update
  using (
    role <> 'owner'
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  )
  with check (
    role <> 'owner'
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members
  for delete
  using (
    role <> 'owner'
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

-- No insert policy on purpose: rows are created by provisioning (service role)
-- and by accept_organization_invitation, both of which check more than RLS can.
revoke insert, update on public.organization_members from anon, authenticated;
grant update (role) on public.organization_members to authenticated;

-- ─── Profiles ─────────────────────────────────────────────────────────────

-- The display name used to live in auth metadata (docs/DEBT.md: "move it to a
-- table once profiles grow a second field"). They now have four, and members
-- need to read each other's, which auth.users never allows.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  -- Free text on purpose: "Sekretaris OSIS 2026/2027" is not an enum.
  title text not null default '' check (char_length(title) <= 80),
  avatar_path text,
  notify_analysis_finished boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.shares_organization_with(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target
  )
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (user_id = auth.uid() or public.shares_organization_with(user_id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke insert, update on public.profiles from anon, authenticated;
grant insert (user_id, display_name, title, notify_analysis_finished, updated_at)
  on public.profiles to authenticated;
-- user_id is in the list because PostgREST writes an upsert as
-- `on conflict do update set` over every column it was sent, the key included.
-- RLS already pins the row to auth.uid(), so the grant adds nothing else.
grant update (user_id, display_name, title, notify_analysis_finished, updated_at)
  on public.profiles to authenticated;

-- Carry existing names over so nobody's name disappears on deploy.
insert into public.profiles (user_id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 80)
from auth.users
on conflict (user_id) do nothing;

-- ─── Invitations ──────────────────────────────────────────────────────────

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320 and email = lower(email)),
  role public.org_role not null check (role <> 'owner'),
  -- SHA-256 of the token in the link. The token itself is shown once and never
  -- stored, so a leaked table is not a leaked set of invitations.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, created_at desc);

alter table public.organization_invitations enable row level security;

drop policy if exists invitations_select on public.organization_invitations;
create policy invitations_select on public.organization_invitations
  for select using (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

drop policy if exists invitations_insert on public.organization_invitations;
create policy invitations_insert on public.organization_invitations
  for insert with check (
    invited_by = auth.uid()
    and role <> 'owner'
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
  );

drop policy if exists invitations_update on public.organization_invitations;
create policy invitations_update on public.organization_invitations
  for update
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- The hash never needs to leave the database: the server hashes the token it
-- was handed and compares inside accept_organization_invitation.
revoke select, update on public.organization_invitations from anon, authenticated;
grant select (
  id, organization_id, email, role, invited_by, created_at, expires_at,
  accepted_at, accepted_by, revoked_at
) on public.organization_invitations to authenticated;
grant update (revoked_at) on public.organization_invitations to authenticated;

/**
 * Joins the caller to the organization an invitation names.
 *
 * One transaction, because the one-organization rule may mean leaving another
 * first. Every signup provisions an organization, so an invitee who signs up
 * to accept already owns one — empty. That one is dropped. Anything with a
 * second member or a single dataset is somebody's work and is never dropped;
 * the caller gets `membership_conflict` and a sentence explaining it instead.
 *
 * Errors are raised as short codes the auth module maps to Indonesian copy.
 */
create or replace function public.accept_organization_invitation(p_token_hash text)
returns table (joined_organization_id uuid, dropped_organization_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.organization_invitations%rowtype;
  v_current_org uuid;
  v_current_role public.org_role;
  v_dropped uuid;
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

  select m.organization_id, m.role into v_current_org, v_current_role
  from public.organization_members m
  where m.user_id = v_uid
  limit 1;

  if v_current_org = v_invite.organization_id then
    update public.organization_invitations
      set accepted_at = now(), accepted_by = v_uid
      where id = v_invite.id;
    return query select v_invite.organization_id, null::uuid;
    return;
  end if;

  if v_current_org is not null then
    if v_current_role <> 'owner'
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = v_current_org and m.user_id <> v_uid
      )
      or exists (
        select 1 from public.datasets d where d.organization_id = v_current_org
      )
    then
      raise exception 'membership_conflict';
    end if;

    delete from public.organizations o where o.id = v_current_org;
    v_dropped := v_current_org;
  end if;

  insert into public.organization_members (user_id, organization_id, role)
  values (v_uid, v_invite.organization_id, v_invite.role);

  update public.organization_invitations
    set accepted_at = now(), accepted_by = v_uid
    where id = v_invite.id;

  return query select v_invite.organization_id, v_dropped;
end;
$$;

/**
 * Hands the organization to another member. The old owner stays on as admin:
 * a graduating chair usually still wants to read the archive for a while, and
 * the new owner can remove them in one click if not.
 *
 * Both rows change in one transaction, so there is never a moment with two
 * owners or none.
 */
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
end;
$$;

/**
 * Whether the caller can sign in with a password. `app_metadata.providers`
 * says "google" for an account that signed up with Google and later set a
 * password, so it cannot answer this; only auth.users can.
 */
create or replace function public.current_user_has_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(u.encrypted_password <> '', false)
  from auth.users u
  where u.id = auth.uid()
$$;

revoke all on function public.shares_organization_with(uuid) from public, anon;
revoke all on function public.accept_organization_invitation(text) from public, anon;
revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;
revoke all on function public.current_user_has_password() from public, anon;
grant execute on function public.shares_organization_with(uuid) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;
grant execute on function public.current_user_has_password() to authenticated;

-- ─── Who ran an analysis ──────────────────────────────────────────────────

-- For "my recent activity", the report provenance, and knowing whom to email
-- when a job finishes. Null for jobs from before this column existed.
alter table public.analysis_jobs
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists analysis_jobs_created_by_idx
  on public.analysis_jobs (created_by, created_at desc)
  where created_by is not null;

-- ─── Logos and avatars ────────────────────────────────────────────────────

-- Private, and no policies: only the service role reads or writes it. The
-- server hands out short-lived signed URLs after checking who is asking.
-- PNG and JPEG only, because those are the two formats the PDF renderer embeds.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
