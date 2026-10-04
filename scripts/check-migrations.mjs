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
/**
 * Files that must not run before the data they constrain exists. On the hosted
 * project they are pasted after the code is deployed; here they run after the
 * seed and the backfill, which is the same order.
 */
const DEFERRED = ['20261002000200_account_required.sql']
const FILES = readdirSync(MIGRATIONS)
  .sort()
  .filter((file) => !DEFERRED.includes(file))
const NEWEST = FILES.at(-1)

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

for (const file of FILES) {
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

// ── account required (20261002000200) ──
await db.exec(
  `update public.organizations set account_id = null where id = '${ORG.orphan}'`,
)
const REQUIRED = readFileSync(join(MIGRATIONS, DEFERRED[0]), 'utf8')
try {
  await db.exec(REQUIRED)
  await db.exec(REQUIRED)
  console.log(`migrated  ${DEFERRED[0]} (twice, after the backfill)`)
} catch (error) {
  console.log(`FAILED    ${DEFERRED[0]}: ${error.message}`)
  process.exit(1)
}
rows = await sql(
  `select count(*)::int as n from public.organizations where account_id is null`,
)
check(
  'account required: a straggler is backfilled before the constraint',
  rows[0].n === 0,
  JSON.stringify(rows),
)
try {
  await db.exec(
    `insert into public.organizations (name, slug) values ('Tanpa akun', 'tanpa-akun')`,
  )
  check('an organization cannot exist without an account', false, 'inserted')
} catch (error) {
  check(
    'an organization cannot exist without an account',
    /not-null|null value/.test(error.message),
    error.message,
  )
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

async function accept(user, hash, leave = null) {
  return leave
    ? as(user, `select * from public.accept_organization_invitation($1, $2)`, [
        hash,
        leave,
      ])
    : as(user, `select * from public.accept_organization_invitation($1)`, [hash])
}
async function membershipsOf(user) {
  const found = await sql(
    `select organization_id, role from public.organization_members where user_id = '${user}'`,
  )
  return Object.fromEntries(found.map((row) => [row.organization_id, row.role]))
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

// Joining adds (ADR-0012). The owner of a workspace with data used to be
// refused; the owner of an empty one used to lose it.
r = await accept(U.busy, 'hash-busy')
check(
  'accept: the owner of a workspace with data can join',
  r.error === null && r.rows[0]?.joined_organization_id === ORG.main,
  r.error ?? JSON.stringify(r.rows),
)
let held = await membershipsOf(U.busy)
check(
  'accept: they keep their own workspace, and join with the invited role',
  held[ORG.busyOwn] === 'owner' && held[ORG.main] === 'viewer',
  JSON.stringify(held),
)
rows = await sql(
  `select count(*)::int as n from public.datasets where organization_id = '${ORG.busyOwn}'`,
)
check('accept: their data is untouched', rows[0].n === 1, JSON.stringify(rows))

r = await accept(U.invitee, 'hash-ok')
check(
  'accept: invitee joins',
  r.error === null && r.rows[0]?.joined_organization_id === ORG.main,
  r.error ?? JSON.stringify(r.rows),
)
check(
  'accept: nothing is reported left when nothing was named',
  r.rows[0]?.left_organization_id === null,
  JSON.stringify(r.rows),
)
held = await membershipsOf(U.invitee)
check(
  'accept: an empty own workspace is kept too',
  held[ORG.inviteeOwn] === 'owner' && held[ORG.main] === 'member',
  JSON.stringify(held),
)
rows = await sql(`select id from public.organizations where id = '${ORG.inviteeOwn}'`)
check('accept: no organization is deleted', rows.length === 1)
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

// Leaving one organization in exchange for another, in one transaction.
await as(
  U.stranger,
  `insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by) values ('${ORG.other}', 'member@osis.test', 'member', 'hash-swap', '${U.stranger}')`,
)
r = await accept(U.member, 'hash-swap', ORG.main)
check(
  'accept: joins one and leaves the one named',
  r.error === null &&
    r.rows[0]?.joined_organization_id === ORG.other &&
    r.rows[0]?.left_organization_id === ORG.main,
  r.error ?? JSON.stringify(r.rows),
)
held = await membershipsOf(U.member)
check(
  'accept: exactly the swap happened',
  held[ORG.other] === 'member' && Object.keys(held).length === 1,
  JSON.stringify(held),
)
await invite(U.owner, 'dual@osis.test', 'member', 'hash-dual')
r = await accept(U.dual, 'hash-dual', ORG.dualFirst)
check(
  'accept: an owned workspace cannot be the one given up',
  /owner_cannot_leave/.test(r.error ?? ''),
  r.error ?? 'accepted',
)
held = await membershipsOf(U.dual)
check(
  'accept: a refused swap changes nothing',
  held[ORG.dualFirst] === 'owner' && held[ORG.main] === undefined,
  JSON.stringify(held),
)
rows = await sql(
  `select accepted_at from public.organization_invitations where token_hash = 'hash-dual'`,
)
check('accept: and leaves the invitation usable', rows[0]?.accepted_at === null)
r = await as(U.dual, `select * from public.accept_organization_invitation($1, $2)`, [
  'hash-dual',
  ORG.other,
])
held = await membershipsOf(U.dual)
check(
  'accept: naming a workspace you are not in leaves nobody else',
  r.error === null &&
    r.rows[0]?.left_organization_id === null &&
    held[ORG.main] === 'member',
  r.error ?? JSON.stringify(r.rows),
)
rows = await sql(
  `select count(*)::int as n from public.organization_members where organization_id = '${ORG.other}'`,
)
check('accept: org B kept all of its members', rows[0].n === 2, JSON.stringify(rows))

// ── leaving ──
// The viewer runs an analysis first, so there is a name to keep afterwards.
await db.exec(`
  insert into public.datasets (id, organization_id, uploader_id, name, source) values
    ('20000000-0000-0000-0000-000000000001', '${ORG.main}', '${U.owner}', 'Survei utama', 'csv');
  insert into public.analysis_jobs (organization_id, dataset_id, prompt_version, created_by) values
    ('${ORG.main}', '20000000-0000-0000-0000-000000000001', 'analysis.v1', '${U.busy}');
`)
r = await as(
  U.owner,
  `delete from public.organization_members where user_id = '${U.owner}' and organization_id = '${ORG.main}'`,
)
check(
  'leave: an owner cannot leave their own workspace',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.busy,
  `delete from public.organization_members where user_id = '${U.invitee}' and organization_id = '${ORG.main}'`,
)
check(
  'leave: a viewer cannot remove someone else',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.busy,
  `delete from public.organization_members where user_id = '${U.busy}' and organization_id = '${ORG.main}'`,
)
check(
  'leave: a viewer leaves a workspace they do not own',
  r.error === null && r.affected === 1,
  r.error ?? `${r.affected} rows`,
)
held = await membershipsOf(U.busy)
check(
  'leave: their own workspace is still theirs',
  held[ORG.busyOwn] === 'owner' && Object.keys(held).length === 1,
  JSON.stringify(held),
)
r = await as(
  U.busy,
  `select id from public.datasets where organization_id = '${ORG.main}'`,
)
check('leave: the workspace is closed to them again', r.rows.length === 0, r.error ?? '')
rows = await sql(
  `select count(*)::int as n from public.analysis_jobs where created_by = '${U.busy}' and organization_id = '${ORG.main}'`,
)
check('leave: the analysis they ran stays behind', rows[0].n === 1, JSON.stringify(rows))
r = await as(U.owner, `select user_id from public.profiles where user_id = '${U.busy}'`)
check(
  'leave: their name is still readable where they ran an analysis',
  r.rows.length === 1,
  r.error ?? `${r.rows.length} rows`,
)
r = await as(
  U.stranger,
  `select user_id from public.profiles where user_id = '${U.busy}'`,
)
check(
  'leave: but not to another tenant',
  r.rows.length === 0,
  r.error ?? `${r.rows.length} rows`,
)
r = await as(U.owner, `select user_id from public.profiles where user_id = '${U.member}'`)
check(
  'leave: someone who left without running anything is no longer readable',
  r.rows.length === 0,
  r.error ?? `${r.rows.length} rows`,
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

// The account follows its only workspace (20261002000300).
rows = await sql(
  `select a.owner_id from public.organizations o join public.accounts a on a.id = o.account_id where o.id = '${ORG.main}'`,
)
check(
  'transfer: the account goes with its only workspace',
  rows[0]?.owner_id === U.admin,
  JSON.stringify(rows),
)
rows = await sql(
  `select count(*)::int as n from public.accounts where owner_id = '${U.owner}'`,
)
check('transfer: the old owner is no longer billed for it', rows[0].n === 0)

// The recipient already has an account: the workspace joins theirs.
await db.exec(
  `insert into public.organization_members (user_id, organization_id, role) values ('${U.invitee}', '${ORG.busyOwn}', 'member'), ('${U.invitee}', '${ORG.dualFirst}', 'member')`,
)
const [inviteeAccount] = await sql(
  `select id from public.accounts where owner_id = '${U.invitee}'`,
)
const [busyAccount] = await sql(
  `select id from public.accounts where owner_id = '${U.busy}'`,
)
r = await as(
  U.busy,
  `select public.transfer_organization_ownership('${ORG.busyOwn}', '${U.invitee}')`,
)
rows = await sql(
  `select account_id from public.organizations where id = '${ORG.busyOwn}'`,
)
check(
  'transfer: a recipient with an account takes the workspace onto it',
  r.error === null && rows[0]?.account_id === inviteeAccount.id,
  r.error ?? JSON.stringify(rows),
)
rows = await sql(`select owner_id from public.accounts where id = '${busyAccount.id}'`)
check(
  'transfer: and the old owner keeps their own, now empty, account',
  rows[0]?.owner_id === U.busy,
  JSON.stringify(rows),
)

// One of several: the account stays where it is.
const [dualAccount] = await sql(
  `select account_id from public.organizations where id = '${ORG.dualFirst}'`,
)
r = await as(
  U.dual,
  `select public.transfer_organization_ownership('${ORG.dualFirst}', '${U.invitee}')`,
)
rows = await sql(
  `select o.account_id, a.owner_id from public.organizations o join public.accounts a on a.id = o.account_id where o.id = '${ORG.dualFirst}'`,
)
check(
  'transfer: one workspace of several leaves the account where it was',
  r.error === null &&
    rows[0]?.account_id === dualAccount.account_id &&
    rows[0]?.owner_id === U.dual,
  r.error ?? JSON.stringify(rows),
)
rows = await sql(
  `select count(*)::int as n from (select owner_id from public.accounts where owner_id is not null group by owner_id having count(*) > 1) d`,
)
check('transfer: nobody ends up with two accounts', rows[0].n === 0)

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

// ── retention (20261003000100) ──
// ORG.dualSecond still has its owner and its dataset at this point.
const RETENTION = readFileSync(join(MIGRATIONS, '20261003000100_retention.sql'), 'utf8')
rows = await sql(
  `select retention_clock_at, archived_at, retention_stage from public.datasets where organization_id = '${ORG.dualSecond}'`,
)
check(
  'retention: a dataset starts with a clock, live, and unnotified',
  rows.length === 1 &&
    rows[0].retention_clock_at !== null &&
    rows[0].archived_at === null &&
    rows[0].retention_stage === 0,
  JSON.stringify(rows),
)
await db.exec(
  `update public.datasets set retention_clock_at = '2020-06-15' where organization_id = '${ORG.dualSecond}'`,
)
await db.exec(RETENTION)
rows = await sql(
  `select retention_clock_at from public.datasets where organization_id = '${ORG.dualSecond}'`,
)
check(
  'retention: a second paste does not restart a clock',
  new Date(rows[0].retention_clock_at).getUTCFullYear() === 2020,
  JSON.stringify(rows),
)
r = await as(
  U.dual,
  `update public.datasets set retention_clock_at = now() where organization_id = '${ORG.dualSecond}'`,
)
check(
  'retention: an owner cannot reset the clock on their own data',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
await db.exec(
  `update public.datasets set archived_at = now() where organization_id = '${ORG.dualSecond}'`,
)
r = await as(
  U.dual,
  `update public.datasets set archived_at = null where organization_id = '${ORG.dualSecond}'`,
)
check('retention: nor un-archive it', r.affected === 0, r.error ?? `${r.affected} rows`)
r = await as(
  U.dual,
  `select id from public.datasets where organization_id = '${ORG.dualSecond}'`,
)
check(
  'retention: an archived dataset is still readable, for the export',
  r.rows.length === 1,
  r.error ?? `${r.rows.length} rows`,
)
try {
  await db.exec(
    `update public.datasets set retention_stage = 4 where organization_id = '${ORG.dualSecond}'`,
  )
  check('retention: the stage is one of four', false, 'accepted 4')
} catch (error) {
  check('retention: the stage is one of four', true, error.message)
}
rows = await sql(
  `select column_name from information_schema.columns where table_name = 'analysis_jobs' and column_name = 'archived_at'`,
)
check('retention: reports can be archived with their dataset', rows.length === 1)

// ── non-answers (20261004000100) ──

const NO_CONTENT = readFileSync(
  join(MIGRATIONS, '20261004000100_no_content_count.sql'),
  'utf8',
)
await db.exec(`
  insert into public.analysis_jobs (organization_id, dataset_id, prompt_version, created_by)
  select organization_id, id, 'analysis.v2', uploader_id from public.datasets
  where organization_id = '${ORG.dualSecond}'
`)
await db.exec(`update public.analysis_jobs set no_content_count = 12`)
await db.exec(NO_CONTENT)
rows = await sql(`select distinct no_content_count from public.analysis_jobs`)
check(
  'no_content: a second paste keeps the counts',
  rows.length === 1 && rows[0].no_content_count === 12,
  JSON.stringify(rows),
)
try {
  await db.exec(`update public.analysis_jobs set no_content_count = -1`)
  check('no_content: the count cannot go negative', false, 'accepted -1')
} catch (error) {
  check('no_content: the count cannot go negative', true, error.message)
}
r = await as(U.dual, `update public.analysis_jobs set no_content_count = 0`)
check(
  'no_content: a member cannot rewrite the count',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)

// ── questions (20261005000100) ──

const QUESTIONS = readFileSync(
  join(MIGRATIONS, '20261005000100_dataset_questions.sql'),
  'utf8',
)
const LEGACY = '20000000-0000-0000-0000-000000000001'
const FRESH = '20000000-0000-0000-0000-000000000002'

// The hosted project's situation: rows stored before the columns existed.
await db.exec(`
  alter table public.responses alter column question_id drop not null;
  alter table public.responses alter column respondent_index drop not null;
  alter table public.responses disable trigger responses_fill_question;
  insert into public.datasets (id, organization_id, uploader_id, name, source, metadata) values
    ('${LEGACY}', '${ORG.dualSecond}', '${U.dual}', 'Survei lama', 'csv',
     '{"text_column_name":"Kritik dan saran"}');
  insert into public.responses (dataset_id, organization_id, text) values
    ('${LEGACY}', '${ORG.dualSecond}', 'Konsumsi telat'),
    ('${LEGACY}', '${ORG.dualSecond}', 'tidak ada'),
    ('${LEGACY}', '${ORG.dualSecond}', 'Kursi kurang');
  alter table public.responses enable trigger responses_fill_question;
`)
await db.exec(QUESTIONS)

rows = await sql(
  `select column_name, question_text, analysis_mode, detected_mode, position
   from public.dataset_questions where dataset_id = '${LEGACY}'`,
)
check(
  'questions: an old dataset becomes one evaluative question named after its column',
  rows.length === 1 &&
    rows[0].column_name === 'Kritik dan saran' &&
    rows[0].question_text === 'Kritik dan saran' &&
    rows[0].analysis_mode === 'evaluative' &&
    rows[0].detected_mode === null &&
    rows[0].position === 0,
  JSON.stringify(rows),
)
rows = await sql(
  `select count(distinct r.question_id)::int as questions,
          array_agg(r.respondent_index order by r.respondent_index) as indexes
   from public.responses r where r.dataset_id = '${LEGACY}'`,
)
check(
  'questions: its responses all point at it, numbered 0, 1, 2',
  rows[0].questions === 1 && JSON.stringify(rows[0].indexes) === '[0,1,2]',
  JSON.stringify(rows),
)
rows = await sql(
  `select count(*)::int as n from public.datasets d
   where not exists (select 1 from public.dataset_questions q where q.dataset_id = d.id)`,
)
check(
  'questions: every dataset has a question, even an empty one',
  rows[0].n === 0,
  `${rows[0].n} without`,
)

const before = await sql(
  `select (select count(*)::int from public.dataset_questions) as questions,
          (select string_agg(id::text || ':' || question_id::text || ':' || respondent_index, ',' order by id)
             from public.responses) as responses`,
)
await db.exec(QUESTIONS)
const after = await sql(
  `select (select count(*)::int from public.dataset_questions) as questions,
          (select string_agg(id::text || ':' || question_id::text || ':' || respondent_index, ',' order by id)
             from public.responses) as responses`,
)
check(
  'questions: a second paste changes nothing',
  JSON.stringify(before) === JSON.stringify(after),
  `${before[0].questions} → ${after[0].questions} questions`,
)

rows = await sql(
  `select is_nullable from information_schema.columns
   where table_name = 'responses' and column_name in ('question_id', 'respondent_index')`,
)
check(
  'questions: a response always has a question and a respondent number',
  rows.length === 2 && rows.every((row) => row.is_nullable === 'NO'),
  JSON.stringify(rows),
)

// The deployed code between the paste and the merge: rows that name neither.
await db.exec(`
  insert into public.datasets (id, organization_id, uploader_id, name, source, metadata) values
    ('${FRESH}', '${ORG.dualSecond}', '${U.dual}', 'Survei baru', 'csv', '{"text_column_name":"Saran"}');
  delete from public.dataset_questions where dataset_id = '${FRESH}';
  insert into public.responses (dataset_id, organization_id, text) values
    ('${FRESH}', '${ORG.dualSecond}', 'satu'),
    ('${FRESH}', '${ORG.dualSecond}', 'dua'),
    ('${FRESH}', '${ORG.dualSecond}', 'tiga');
`)
rows = await sql(
  `select (select count(*)::int from public.dataset_questions where dataset_id = '${FRESH}') as questions,
          (select question_text from public.dataset_questions where dataset_id = '${FRESH}') as title,
          (select count(distinct question_id)::int from public.responses where dataset_id = '${FRESH}') as used,
          (select array_agg(respondent_index order by respondent_index)
             from public.responses where dataset_id = '${FRESH}') as indexes`,
)
check(
  'questions: rows that name no question get the default one, created once',
  rows[0].questions === 1 && rows[0].title === 'Saran' && rows[0].used === 1,
  JSON.stringify(rows),
)
check(
  'questions: and are numbered in the order they arrive',
  JSON.stringify(rows[0].indexes) === '[0,1,2]',
  JSON.stringify(rows[0].indexes),
)

// The current upload: two questions, one respondent answering both.
await db.exec(`
  insert into public.dataset_questions (id, dataset_id, organization_id, column_name, question_text, position)
  values ('30000000-0000-0000-0000-000000000001', '${FRESH}', '${ORG.dualSecond}', 'Kesan', 'Kesan', 1);
  insert into public.responses (dataset_id, organization_id, text, question_id, respondent_index) values
    ('${FRESH}', '${ORG.dualSecond}', 'seru', '30000000-0000-0000-0000-000000000001', 0);
`)
rows = await sql(
  `select question_id, respondent_index from public.responses
   where dataset_id = '${FRESH}' and text = 'seru'`,
)
check(
  'questions: a row that names its question and respondent is stored as given',
  rows.length === 1 &&
    rows[0].question_id === '30000000-0000-0000-0000-000000000001' &&
    rows[0].respondent_index === 0,
  JSON.stringify(rows),
)

try {
  await db.exec(
    `update public.dataset_questions set analysis_mode = 'sentimen' where dataset_id = '${FRESH}'`,
  )
  check('questions: the mode is one of six', false, 'accepted "sentimen"')
} catch (error) {
  check('questions: the mode is one of six', true, error.message)
}

r = await as(
  U.dual,
  `select id from public.dataset_questions where dataset_id = '${FRESH}'`,
)
check(
  'questions: a member reads the questions of their workspace',
  r.rows.length === 2,
  r.error ?? `${r.rows.length} rows`,
)
r = await as(U.stranger, `select id from public.dataset_questions`)
check(
  'questions: and nobody else does',
  r.rows.length === 0,
  r.error ?? `${r.rows.length} rows`,
)
r = await as(
  U.dual,
  `update public.dataset_questions set question_text = 'diubah' where dataset_id = '${FRESH}'`,
)
check(
  'questions: a member cannot rewrite a question',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.dual,
  `insert into public.dataset_questions (dataset_id, organization_id, column_name, question_text, position)
   values ('${FRESH}', '${ORG.dualSecond}', 'Sisipan', 'Sisipan', 9)`,
)
check('questions: or add one', r.error !== null, r.error ?? 'inserted')

rows = await sql(`select question_counts from public.analysis_jobs limit 1`)
check(
  'questions: a job starts with no per-question counts',
  rows.length === 1 && JSON.stringify(rows[0].question_counts) === '{}',
  JSON.stringify(rows),
)
r = await as(U.dual, `update public.analysis_jobs set question_counts = '{"x":1}'::jsonb`)
check(
  'questions: a member cannot rewrite the counts',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)

await db.exec(`delete from public.datasets where id = '${FRESH}'`)
rows = await sql(
  `select (select count(*)::int from public.dataset_questions where dataset_id = '${FRESH}') as questions,
          (select count(*)::int from public.responses where dataset_id = '${FRESH}') as responses`,
)
check(
  'questions: deleting a dataset takes its questions and answers with it',
  rows[0].questions === 0 && rows[0].responses === 0,
  JSON.stringify(rows),
)

// ── a result without a sentiment (20261006000100) ──

const MODES_JOB = '40000000-0000-0000-0000-000000000001'
await db.exec(`
  insert into public.analysis_jobs (id, organization_id, dataset_id, prompt_version)
  values ('${MODES_JOB}', '${ORG.dualSecond}', '${LEGACY}', 'analysis.v3')
`)
const answers = await sql(
  `select id from public.responses where dataset_id = '${LEGACY}' order by respondent_index`,
)
const result = (responseId, sentiment, confidence) => `
  insert into public.analysis_results
    (organization_id, job_id, response_id, sentiment, sentiment_confidence, topics, prompt_version, model_id)
  values
    ('${ORG.dualSecond}', '${MODES_JOB}', '${responseId}', ${sentiment}, ${confidence}, '{outbound}', 'analysis.v3', 'probe')
`

// What the code that is live while this is pasted writes: both, always.
await db.exec(result(answers[0].id, `'negative'`, '0.9'))
// What the new code writes for a question that is not read for sentiment.
await db.exec(result(answers[1].id, 'null', 'null'))
rows = await sql(
  `select sentiment, sentiment_confidence from public.analysis_results
   where job_id = '${MODES_JOB}' order by sentiment nulls last`,
)
check(
  'modes: a result is stored with a sentiment or without one',
  rows.length === 2 &&
    rows[0].sentiment === 'negative' &&
    rows[1].sentiment === null &&
    rows[1].sentiment_confidence === null,
  JSON.stringify(rows),
)

for (const [name, sentiment, confidence] of [
  ['a sentiment with no confidence', `'positive'`, 'null'],
  ['a confidence with no sentiment', 'null', '0.5'],
]) {
  try {
    await db.exec(result(answers[2].id, sentiment, confidence))
    check(`modes: ${name} is refused`, false, 'accepted')
  } catch (error) {
    check(`modes: ${name} is refused`, true, error.message)
  }
}

rows = await sql(
  `select is_nullable from information_schema.columns
   where table_name = 'analysis_results' and column_name in ('sentiment', 'sentiment_confidence')`,
)
check(
  'modes: a second paste leaves both columns optional',
  rows.length === 2 && rows.every((row) => row.is_nullable === 'YES'),
  JSON.stringify(rows),
)

r = await as(
  U.dual,
  `select sentiment from public.analysis_results where job_id = '${MODES_JOB}'`,
)
check(
  'modes: a member reads results that have no sentiment like any other',
  r.rows.length === 2,
  r.error ?? `${r.rows.length} rows`,
)
r = await as(
  U.dual,
  `update public.analysis_results set sentiment = 'positive', sentiment_confidence = 1
   where job_id = '${MODES_JOB}'`,
)
check(
  'modes: and cannot give one a sentiment',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.stranger,
  `select id from public.analysis_results where job_id = '${MODES_JOB}'`,
)
check(
  'modes: nobody else reads them',
  r.rows.length === 0,
  r.error ?? `${r.rows.length} rows`,
)

// ── topic merges (20261007000100) ──

const MERGES = readFileSync(join(MIGRATIONS, '20261007000100_topic_merges.sql'), 'utf8')
rows = await sql(
  `select topic_merges from public.analysis_jobs where id = '${MODES_JOB}'`,
)
check(
  'merges: a job starts with nothing merged',
  rows.length === 1 && JSON.stringify(rows[0].topic_merges) === '{}',
  JSON.stringify(rows),
)
const STORED_MERGES = {
  prompt_version: 'merge.v1',
  questions: { probe: { 'percaya diri': 'kepercayaan diri' } },
}
await db.exec(
  `update public.analysis_jobs set topic_merges = '${JSON.stringify(STORED_MERGES)}'::jsonb
   where id = '${MODES_JOB}'`,
)
// Pasting it a second time must not reset what jobs have recorded since.
await db.exec(MERGES)
rows = await sql(
  `select topic_merges from public.analysis_jobs where id = '${MODES_JOB}'`,
)
check(
  'merges: pasting the migration again keeps what a job recorded',
  rows[0]?.topic_merges?.questions?.probe?.['percaya diri'] === 'kepercayaan diri',
  JSON.stringify(rows),
)
try {
  await db.exec(
    `update public.analysis_jobs set topic_merges = '[]'::jsonb where id = '${MODES_JOB}'`,
  )
  check('merges: anything but an object is refused', false, 'accepted')
} catch (error) {
  check('merges: anything but an object is refused', true, String(error.message))
}
r = await as(U.dual, `update public.analysis_jobs set topic_merges = '{}'::jsonb`)
check(
  'merges: a member cannot rewrite them',
  r.affected === 0,
  r.error ?? `${r.affected} rows`,
)
r = await as(
  U.dual,
  `select topic_merges from public.analysis_jobs where id = '${MODES_JOB}'`,
)
check(
  'merges: a member reads them with the job',
  r.rows.length === 1 && r.rows[0].topic_merges?.prompt_version === 'merge.v1',
  r.error ?? JSON.stringify(r.rows),
)
r = await as(
  U.stranger,
  `select topic_merges from public.analysis_jobs where id = '${MODES_JOB}'`,
)
check('merges: nobody else does', r.rows.length === 0, r.error ?? `${r.rows.length} rows`)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
