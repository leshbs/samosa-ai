/**
 * Migration and policy probe that needs no database (checklist 5.x).
 *
 *   node scripts/check-migrations.mjs
 *
 * The Supabase CLI cannot reach the hosted project without its database
 * password, and Docker is not a given on a school laptop, so neither
 * `supabase db reset` nor a local stack is a dependable way to prove a
 * migration works before it is pasted into the SQL Editor. PGlite — Postgres
 * compiled to WebAssembly — is: it runs every file in supabase/migrations in
 * order against a stub of the parts of Supabase they touch (the auth and
 * storage schemas, the anon/authenticated roles and their default grants),
 * runs the newest file a second time to prove it is idempotent, then probes the
 * settings policies and functions as different users.
 *
 * What it cannot prove: anything about PostgREST, Storage, or Supabase's real
 * grants. `scripts/check-rls.mjs` covers those against the hosted project,
 * once the migration has been applied there.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations')
const NEWEST = readdirSync(MIGRATIONS).sort().at(-1)

const db = new PGlite({ extensions: { pgcrypto } })

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    encrypted_password text default '',
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$
    select string_to_array(name, '/')
  $$;
`)

for (const file of readdirSync(MIGRATIONS).sort()) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
  try {
    await db.exec(sql)
    console.log(`migrated  ${file}`)
  } catch (error) {
    console.log(`FAILED    ${file}: ${error.message}`)
    process.exit(1)
  }
}

// Idempotency: the newest file must survive a second paste.
try {
  await db.exec(readFileSync(join(MIGRATIONS, NEWEST), 'utf8'))
  console.log(`re-ran    ${NEWEST} (idempotent)`)
} catch (error) {
  console.log(`FAILED    re-run: ${error.message}`)
  process.exit(1)
}

let failures = 0
function check(name, passed, detail = '') {
  if (!passed) failures += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const U = {
  owner: '00000000-0000-0000-0000-000000000001',
  admin: '00000000-0000-0000-0000-000000000002',
  member: '00000000-0000-0000-0000-000000000003',
  invitee: '00000000-0000-0000-0000-000000000004',
  busy: '00000000-0000-0000-0000-000000000005',
  stranger: '00000000-0000-0000-0000-000000000006',
  wrongEmail: '00000000-0000-0000-0000-000000000007',
  dual: '00000000-0000-0000-0000-000000000008',
}
const ORG = {
  main: '10000000-0000-0000-0000-000000000001',
  inviteeOwn: '10000000-0000-0000-0000-000000000002',
  busyOwn: '10000000-0000-0000-0000-000000000003',
  other: '10000000-0000-0000-0000-000000000004',
  wrongOwn: '10000000-0000-0000-0000-000000000005',
  dualFirst: '10000000-0000-0000-0000-000000000006',
  dualSecond: '10000000-0000-0000-0000-000000000007',
  orphan: '10000000-0000-0000-0000-000000000008',
}

await db.exec(`
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
    ('${U.owner}', 'owner@osis.test', 'hash', '{"full_name":"Ketua Lama"}'),
    ('${U.admin}', 'admin@osis.test', '', '{}'),
    ('${U.member}', 'member@osis.test', 'hash', '{}'),
    ('${U.invitee}', 'invitee@osis.test', 'hash', '{}'),
    ('${U.busy}', 'busy@osis.test', 'hash', '{}'),
    ('${U.stranger}', 'stranger@other.test', 'hash', '{}'),
    ('${U.wrongEmail}', 'someone-else@osis.test', 'hash', '{}'),
    ('${U.dual}', 'dual@osis.test', 'hash', '{}');
  insert into public.organizations (id, name, slug) values
    ('${ORG.main}', 'OSIS Nusantara', 'osis-nusantara'),
    ('${ORG.inviteeOwn}', 'Organisasi invitee', 'org-invitee'),
    ('${ORG.busyOwn}', 'Organisasi busy', 'org-busy'),
    ('${ORG.other}', 'Sekolah Lain', 'sekolah-lain'),
    ('${ORG.wrongOwn}', 'Organisasi wrong', 'org-wrong'),
    ('${ORG.dualFirst}', 'OSIS dual', 'osis-dual'),
    ('${ORG.dualSecond}', 'MPK dual', 'mpk-dual'),
    ('${ORG.orphan}', 'Tanpa pemilik', 'tanpa-pemilik');
  insert into public.organization_members (user_id, organization_id, role) values
    ('${U.owner}', '${ORG.main}', 'owner'),
    ('${U.admin}', '${ORG.main}', 'admin'),
    ('${U.member}', '${ORG.main}', 'member'),
    ('${U.invitee}', '${ORG.inviteeOwn}', 'owner'),
    ('${U.busy}', '${ORG.busyOwn}', 'owner'),
    ('${U.stranger}', '${ORG.other}', 'owner'),
    ('${U.wrongEmail}', '${ORG.wrongOwn}', 'owner'),
    ('${U.dual}', '${ORG.dualFirst}', 'owner'),
    ('${U.dual}', '${ORG.dualSecond}', 'owner');
  insert into public.datasets (organization_id, uploader_id, name, source) values
    ('${ORG.busyOwn}', '${U.busy}', 'Survei', 'csv'),
    ('${ORG.dualFirst}', '${U.dual}', 'Survei OSIS', 'csv'),
    ('${ORG.dualSecond}', '${U.dual}', 'Survei MPK', 'csv');
  insert into public.profiles (user_id, display_name, title) values
    ('${U.stranger}', 'Orang Lain', 'Ketua');
`)

// The backfill ran before these users existed; the owner row comes from a re-run.
await db.exec(`
  insert into public.profiles (user_id, display_name)
  select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 80) from auth.users
  on conflict (user_id) do nothing;
`)

/** Runs `sql` as `user` through the authenticated role, inside a rolled-back tx. */
async function as(user, sql, params = []) {
  await db.exec('begin')
  try {
    await db.exec(
      `set local role authenticated; select set_config('request.jwt.claim.sub', '${user}', true);`,
    )
    const result = await db.query(sql, params)
    await db.exec('commit')
    return { rows: result.rows, affected: result.affectedRows ?? 0, error: null }
  } catch (error) {
    await db.exec('rollback')
    return { rows: [], affected: 0, error: error.message }
  }
}

async function sql(text) {
  return (await db.query(text)).rows
}

// ── accounts (20261001000100) ──
// The organizations above were seeded after the migrations ran, which is the
// hosted project's situation exactly: rows that predate the accounts table.
// Pasting the file again is the backfill.
const ACCOUNTS = readFileSync(join(MIGRATIONS, '20261001000100_accounts.sql'), 'utf8')
await db.exec(ACCOUNTS)

let rows = await sql(
  `select count(*)::int as n from public.organizations where account_id is null`,
)
check(
  'backfill: every organization has an account',
  rows[0].n === 0,
  JSON.stringify(rows),
)
rows = await sql(
  `select count(*)::int as accounts, count(distinct owner_id)::int as owners from public.accounts where owner_id is not null`,
)
check(
  'backfill: one account per owner',
  rows[0].accounts === rows[0].owners && rows[0].owners === 6,
  JSON.stringify(rows),
)
rows = await sql(
  `select count(distinct o.account_id)::int as n, bool_and(a.owner_id = '${U.dual}') as owned from public.organizations o join public.accounts a on a.id = o.account_id where o.id in ('${ORG.dualFirst}', '${ORG.dualSecond}')`,
)
check(
  'backfill: two workspaces of one owner share an account',
  rows[0].n === 1 && rows[0].owned === true,
  JSON.stringify(rows),
)
rows = await sql(
  `select a.owner_id, a.plan from public.organizations o join public.accounts a on a.id = o.account_id where o.id = '${ORG.orphan}'`,
)
check(
  'backfill: an ownerless organization gets an ownerless free account',
  rows.length === 1 && rows[0].owner_id === null && rows[0].plan === 'free',
  JSON.stringify(rows),
)
const [{ n: accountsBefore }] = await sql(
  `select count(*)::int as n from public.accounts`,
)
await db.exec(ACCOUNTS)
rows = await sql(`select count(*)::int as n from public.accounts`)
check(
  'backfill: a second paste adds nothing',
  rows[0].n === accountsBefore,
  `${accountsBefore} → ${rows[0].n}`,
)
const [mainAccount] = await sql(
  `select account_id from public.organizations where id = '${ORG.main}'`,
)
const [otherAccount] = await sql(
  `select account_id from public.organizations where id = '${ORG.other}'`,
)

let r = await as(U.member, `select id, plan from public.accounts`)
check(
  'a member reads the account of their workspace, and only that',
  r.rows.length === 1 && r.rows[0].id === mainAccount.account_id,
  r.error ?? JSON.stringify(r.rows),
)
r = await as(
  U.stranger,
  `select id from public.accounts where id = '${mainAccount.account_id}'`,
)
check('another tenant cannot read the account', r.rows.length === 0, r.error ?? '')
r = await as(
  U.owner,
  `update public.accounts set plan = 'enterprise' where id = '${mainAccount.account_id}'`,
)
check(
  'an owner cannot change their own plan',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `update public.accounts set limits = '{"maxWorkspaces":99}' where id = '${mainAccount.account_id}'`,
)
check(
  'an owner cannot lift their own limits',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.member,
  `insert into public.accounts (owner_id, plan) values ('${U.member}', 'org')`,
)
check(
  'nobody creates an account from the browser',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `delete from public.accounts where id = '${mainAccount.account_id}'`,
)
check(
  'nobody deletes an account from the browser',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `update public.organizations set account_id = '${otherAccount.account_id}' where id = '${ORG.main}'`,
)
check(
  'a workspace cannot be moved onto another account',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
try {
  await db.exec(`insert into public.accounts (owner_id) values ('${U.owner}')`)
  check('one account per person, even for the service role', false, 'second row accepted')
} catch (error) {
  check(
    'one account per person, even for the service role',
    /accounts_owner_key/.test(error.message),
    error.message,
  )
}
try {
  await db.exec(`delete from public.accounts where id = '${mainAccount.account_id}'`)
  check('an account with workspaces cannot be deleted', false, 'deleted')
} catch (error) {
  check('an account with workspaces cannot be deleted', true, error.message)
}

// ── two workspaces, one person (ADR-0012) ──
// Not a control but the reason for one: RLS admits both workspaces, so the
// filter on the active workspace is what keeps a page to one of them.
r = await as(U.dual, `select organization_id from public.datasets`)
check(
  'RLS alone shows a person both of their workspaces',
  new Set(r.rows.map((row) => row.organization_id)).size === 2,
  r.error ?? JSON.stringify(r.rows),
)
check(
  'two workspaces do not widen access to a third',
  r.rows.every((row) => [ORG.dualFirst, ORG.dualSecond].includes(row.organization_id)),
  JSON.stringify(r.rows),
)
r = await as(
  U.dual,
  `select organization_id from public.datasets where organization_id = '${ORG.dualFirst}'`,
)
check(
  'the workspace filter narrows it to one',
  r.rows.length === 1 && r.rows[0].organization_id === ORG.dualFirst,
  r.error ?? JSON.stringify(r.rows),
)

// ── organizations ──
r = await as(
  U.owner,
  `update public.organizations set name = 'OSIS Nusantara 2027', timezone = 'Asia/Makassar' where id = '${ORG.main}'`,
)
check(
  'owner renames and sets timezone',
  r.error === null && r.affected === 1,
  r.error ?? '',
)
r = await as(
  U.admin,
  `update public.organizations set name = 'Admin was here' where id = '${ORG.main}'`,
)
check(
  'admin cannot rename the organization',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.owner,
  `update public.organizations set logo_path = 'org/${ORG.other}/logo.png' where id = '${ORG.main}'`,
)
check(
  'owner cannot write logo_path directly',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `update public.organizations set timezone = 'Europe/London' where id = '${ORG.main}'`,
)
check('timezone limited to WIB/WITA/WIT', r.error !== null, r.error ?? 'allowed')
r = await as(
  U.owner,
  `update public.organizations set report_include_topic_tail = true where id = '${ORG.main}'`,
)
check(
  'owner toggles a report default',
  r.error === null && r.affected === 1,
  r.error ?? '',
)
r = await as(U.admin, `delete from public.organizations where id = '${ORG.main}'`)
check(
  'admin cannot delete the organization',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)

// ── membership ──
r = await as(
  U.admin,
  `update public.organization_members set role = 'owner' where user_id = '${U.admin}'`,
)
check(
  'admin cannot promote self to owner',
  r.error !== null || r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.admin,
  `update public.organization_members set role = 'viewer' where user_id = '${U.owner}'`,
)
check('admin cannot demote the owner', r.affected === 0, r.error ?? `${r.affected} rows`)
r = await as(
  U.admin,
  `delete from public.organization_members where user_id = '${U.owner}'`,
)
check('admin cannot remove the owner', r.affected === 0, r.error ?? `${r.affected} rows`)
r = await as(
  U.admin,
  `update public.organization_members set role = 'viewer' where user_id = '${U.member}' and organization_id = '${ORG.main}'`,
)
check('admin changes a member role', r.error === null && r.affected === 1, r.error ?? '')
r = await as(
  U.member,
  `update public.organization_members set role = 'admin' where user_id = '${U.member}'`,
)
check('member cannot change own role', r.affected === 0, r.error ?? `${r.affected} rows`)
r = await as(
  U.admin,
  `update public.organization_members set organization_id = '${ORG.other}' where user_id = '${U.member}'`,
)
check(
  'organization_id is not writable',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)
r = await as(
  U.admin,
  `insert into public.organization_members (user_id, organization_id, role) values ('${U.stranger}', '${ORG.main}', 'member')`,
)
check('nobody inserts memberships directly', r.error !== null, r.error ?? 'allowed')
r = await as(
  U.stranger,
  `update public.organization_members set role = 'viewer' where organization_id = '${ORG.main}'`,
)
check(
  'another tenant cannot touch members',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)

// ── profiles ──
r = await as(
  U.member,
  `select user_id, display_name from public.profiles order by user_id`,
)
const seen = r.rows.map((row) => row.user_id)
check(
  'member sees co-member profiles',
  seen.includes(U.owner) && seen.includes(U.admin),
  JSON.stringify(seen),
)
check(
  'member does not see another tenant',
  !seen.includes(U.stranger),
  JSON.stringify(seen),
)
check(
  'backfill carried the metadata name',
  r.rows.find((row) => row.user_id === U.owner)?.display_name === 'Ketua Lama',
)
r = await as(
  U.member,
  `insert into public.profiles (user_id, display_name, title) values ('${U.member}', 'Sekretaris', 'Sekretaris OSIS 2026/2027') on conflict (user_id) do update set display_name = excluded.display_name, title = excluded.title, updated_at = now()`,
)
check('member upserts own profile', r.error === null, r.error ?? '')
r = await as(
  U.member,
  `insert into public.profiles as p (user_id, display_name, title, notify_analysis_finished, updated_at) values ('${U.member}', 'Sekretaris', 'Sekretaris OSIS', false, now()) on conflict (user_id) do update set user_id = excluded.user_id, display_name = excluded.display_name, title = excluded.title, notify_analysis_finished = excluded.notify_analysis_finished, updated_at = excluded.updated_at returning display_name, title`,
)
check(
  'PostgREST-shaped upsert of own profile',
  r.error === null && r.rows[0]?.title === 'Sekretaris OSIS',
  r.error ?? '',
)
r = await as(
  U.member,
  `insert into public.profiles (user_id, display_name) values ('${U.owner}', 'Hacked') on conflict (user_id) do update set user_id = excluded.user_id, display_name = excluded.display_name`,
)
check("upsert cannot overwrite another's profile", r.error !== null, r.error ?? 'allowed')
r = await as(
  U.member,
  `insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by) values ('${ORG.main}', 'y@osis.test', 'member', 'h', '${U.member}') returning id, email, role, created_at, expires_at`,
)
check('member insert-returning still refused', r.error !== null, r.error ?? 'allowed')
r = await as(
  U.member,
  `update public.profiles set display_name = 'Hacked' where user_id = '${U.owner}'`,
)
check(
  "member cannot edit another's profile",
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.member,
  `update public.profiles set avatar_path = 'user/${U.owner}/a.png' where user_id = '${U.member}'`,
)
check(
  'avatar_path is not writable',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)

// ── password probe ──
r = await as(U.owner, `select public.current_user_has_password() as has`)
check('password: account with one', r.rows[0]?.has === true, JSON.stringify(r.rows))
r = await as(U.admin, `select public.current_user_has_password() as has`)
check('password: Google-only account', r.rows[0]?.has === false, JSON.stringify(r.rows))

// ── invitations ──
const future = `now() + interval '7 days'`
async function invite(by, email, role, hash, extra = '') {
  return as(
    by,
    `insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by${extra ? ', expires_at' : ''}) values ('${ORG.main}', '${email}', '${role}', '${hash}', '${by}'${extra ? `, ${extra}` : ''}) returning id`,
  )
}
r = await as(
  U.admin,
  `insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by) values ('${ORG.main}', 'invitee@osis.test', 'member', 'hash-ok', '${U.admin}') returning id, email, role, created_at, expires_at`,
)
check('admin invites a member', r.error === null, r.error ?? '')
r = await invite(U.admin, 'x@osis.test', 'owner', 'hash-owner')
check('nobody invites an owner', r.error !== null, r.error ?? 'allowed')
r = await invite(U.member, 'x@osis.test', 'member', 'hash-member')
check('a member cannot invite', r.error !== null, r.error ?? 'allowed')
r = await as(
  U.admin,
  `insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by) values ('${ORG.main}', 'x@osis.test', 'member', 'hash-spoof', '${U.owner}')`,
)
check('invited_by cannot be spoofed', r.error !== null, r.error ?? 'allowed')
r = await as(U.admin, `select token_hash from public.organization_invitations`)
check(
  'token_hash is not readable',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'readable',
)
r = await as(U.admin, `select id, email, role from public.organization_invitations`)
check(
  'admin lists invitations',
  r.error === null && r.rows.length === 1,
  r.error ?? String(r.rows.length),
)
r = await as(U.stranger, `select id from public.organization_invitations`)
check('another tenant sees no invitations', r.rows.length === 0, String(r.rows.length))
await invite(U.owner, 'busy@osis.test', 'viewer', 'hash-busy')
await invite(U.owner, 'someone@osis.test', 'member', 'hash-wrong')
await invite(
  U.owner,
  'late@osis.test',
  'member',
  'hash-expired',
  `now() - interval '1 day'`,
)
await invite(U.owner, 'revoked@osis.test', 'member', 'hash-revoked')
const [revokedRow] = await sql(
  `select id from public.organization_invitations where token_hash = 'hash-revoked'`,
)
r = await as(
  U.owner,
  `update public.organization_invitations set revoked_at = now() where id = '${revokedRow.id}'`,
)
check('owner revokes an invitation', r.error === null, r.error ?? '')
r = await as(
  U.owner,
  `update public.organization_invitations set role = 'admin' where token_hash = 'hash-busy'`,
)
check(
  'invitation role is not editable',
  r.error !== null && /permission denied/.test(r.error),
  r.error ?? 'allowed',
)

async function accept(user, hash) {
  return as(user, `select * from public.accept_organization_invitation($1)`, [hash])
}
r = await accept(U.wrongEmail, 'hash-wrong')
check(
  'accept: email mismatch refused',
  /invitation_email_mismatch/.test(r.error ?? ''),
  r.error ?? 'accepted',
)
r = await accept(U.invitee, 'hash-nope')
check(
  'accept: unknown token refused',
  /invitation_not_found/.test(r.error ?? ''),
  r.error ?? 'accepted',
)
r = await accept(U.busy, 'hash-busy')
check(
  'accept: owner of a non-empty org refused',
  /membership_conflict/.test(r.error ?? ''),
  r.error ?? 'accepted',
)
r = await accept(U.invitee, 'hash-ok')
check(
  'accept: invitee joins',
  r.error === null && r.rows[0]?.joined_organization_id === ORG.main,
  r.error ?? JSON.stringify(r.rows),
)
check(
  'accept: empty own org reported dropped',
  r.rows[0]?.dropped_organization_id === ORG.inviteeOwn,
  JSON.stringify(r.rows),
)
rows = await sql(
  `select organization_id, role from public.organization_members where user_id = '${U.invitee}'`,
)
check(
  'accept: exactly one membership, with the invited role',
  rows.length === 1 && rows[0].organization_id === ORG.main && rows[0].role === 'member',
  JSON.stringify(rows),
)
rows = await sql(`select id from public.organizations where id = '${ORG.inviteeOwn}'`)
check('accept: the empty org is gone', rows.length === 0)
r = await accept(U.invitee, 'hash-ok')
check(
  'accept: reopening the link is idempotent',
  r.error === null && r.rows[0]?.joined_organization_id === ORG.main,
  r.error ?? '',
)
r = await accept(U.stranger, 'hash-ok')
check(
  'accept: used link refused for someone else',
  /invitation_used/.test(r.error ?? ''),
  r.error ?? 'accepted',
)

await db.exec(
  `update auth.users set email = 'late@osis.test' where id = '${U.wrongEmail}'`,
)
r = await accept(U.wrongEmail, 'hash-expired')
check(
  'accept: expired refused',
  /invitation_expired/.test(r.error ?? ''),
  r.error ?? 'accepted',
)
await db.exec(
  `update auth.users set email = 'revoked@osis.test' where id = '${U.wrongEmail}'`,
)
r = await accept(U.wrongEmail, 'hash-revoked')
check(
  'accept: revoked refused',
  /invitation_revoked/.test(r.error ?? ''),
  r.error ?? 'accepted',
)

// ── ownership transfer ──
r = await as(
  U.admin,
  `select public.transfer_organization_ownership('${ORG.main}', '${U.admin}')`,
)
check(
  'transfer: only the owner can',
  /not_owner/.test(r.error ?? ''),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `select public.transfer_organization_ownership('${ORG.main}', '${U.owner}')`,
)
check('transfer: not to yourself', /same_user/.test(r.error ?? ''), r.error ?? 'allowed')
r = await as(
  U.owner,
  `select public.transfer_organization_ownership('${ORG.main}', '${U.stranger}')`,
)
check(
  'transfer: only to a member',
  /not_a_member/.test(r.error ?? ''),
  r.error ?? 'allowed',
)
r = await as(
  U.owner,
  `select public.transfer_organization_ownership('${ORG.main}', '${U.admin}')`,
)
check('transfer: owner hands over', r.error === null, r.error ?? '')
rows = await sql(
  `select user_id, role from public.organization_members where organization_id = '${ORG.main}' order by user_id`,
)
const roleOf = Object.fromEntries(rows.map((row) => [row.user_id, row.role]))
check('transfer: new owner is owner', roleOf[U.admin] === 'owner', JSON.stringify(roleOf))
check(
  'transfer: old owner stays as admin',
  roleOf[U.owner] === 'admin',
  JSON.stringify(roleOf),
)
check(
  'transfer: exactly one owner',
  rows.filter((row) => row.role === 'owner').length === 1,
)

// ── deletion cascades ──
r = await as(U.admin, `delete from public.organizations where id = '${ORG.main}'`)
check(
  'new owner deletes the organization',
  r.error === null && r.affected === 1,
  r.error ?? `${r.affected} rows`,
)
rows = await sql(
  `select count(*)::int as n from public.organization_members where organization_id = '${ORG.main}'`,
)
check('deletion cascades to memberships', rows[0].n === 0, JSON.stringify(rows))
rows = await sql(
  `select count(*)::int as n from public.organization_invitations where organization_id = '${ORG.main}'`,
)
check('deletion cascades to invitations', rows[0].n === 0, JSON.stringify(rows))

// ── jobs.created_by ──
rows = await sql(
  `select column_name from information_schema.columns where table_name = 'analysis_jobs' and column_name = 'created_by'`,
)
check('analysis_jobs.created_by exists', rows.length === 1)
rows = await sql(`select id from storage.buckets where id = 'branding'`)
check('branding bucket exists', rows.length === 1)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
