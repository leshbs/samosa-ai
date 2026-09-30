/**
 * Cross-tenant RLS probe (checklist 9.2).
 *
 *   node --env-file=.env.local scripts/check-rls.mjs
 *
 * Creates two throwaway organizations with one user each, fills both with a
 * dataset, a response, a job, a result and a report, then signs in as user A
 * with the *anon* key — the same key the browser uses — and tries to reach
 * every one of user B's rows. Nothing may come back, and nothing may be
 * written.
 *
 * It runs against whichever project `.env.local` points at, so it is a script
 * rather than a vitest file: `pnpm test:run` must stay offline and free.
 *
 * Everything it creates is deleted in a `finally`, including on failure.
 * Deleting the two auth users cascades to memberships; organizations are
 * dropped explicitly and cascade to everything else.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error('Missing env. Run with: node --env-file=.env.local scripts/check-rls.mjs')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = Date.now()
const results = []
let failures = 0
let skipped = 0

function check(name, passed, detail = '') {
  results.push({ name, passed, detail })
  if (!passed) failures += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * A control that is absent is not a control that passed.
 *
 * The first version of this script asked whether `rate_limits` was readable,
 * got "no such table", and printed PASS. Anything that can go green because a
 * thing does not exist is reported separately, and loudly.
 */
function skip(name, reason) {
  skipped += 1
  console.log(`SKIP  ${name} — ${reason}`)
}

/** Builds a whole tenant with the service role, bypassing RLS on purpose. */
async function seedTenant(label) {
  const email = `rls-probe-${label}-${stamp}@samosa.test`
  const password = `probe-${stamp}-${label}`

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (userError) throw new Error(`createUser(${label}): ${userError.message}`)
  const userId = created.user.id

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: `RLS Probe ${label} ${stamp}`, slug: `rls-probe-${label}-${stamp}` })
    .select('id')
    .single()
  if (orgError) throw new Error(`organizations(${label}): ${orgError.message}`)

  const { error: memberError } = await admin
    .from('organization_members')
    .insert({ user_id: userId, organization_id: org.id, role: 'owner' })
  if (memberError) throw new Error(`members(${label}): ${memberError.message}`)

  const { data: dataset, error: datasetError } = await admin
    .from('datasets')
    .insert({
      organization_id: org.id,
      uploader_id: userId,
      name: `probe-${label}`,
      source: 'csv',
      response_count: 1,
    })
    .select('id')
    .single()
  if (datasetError) throw new Error(`datasets(${label}): ${datasetError.message}`)

  const { data: response, error: responseError } = await admin
    .from('responses')
    .insert({
      dataset_id: dataset.id,
      organization_id: org.id,
      text: `rahasia organisasi ${label}`,
    })
    .select('id')
    .single()
  if (responseError) throw new Error(`responses(${label}): ${responseError.message}`)

  const { data: job, error: jobError } = await admin
    .from('analysis_jobs')
    .insert({
      organization_id: org.id,
      dataset_id: dataset.id,
      status: 'succeeded',
      prompt_version: 'analysis.v1',
      total_count: 1,
      processed_count: 1,
    })
    .select('id')
    .single()
  if (jobError) throw new Error(`jobs(${label}): ${jobError.message}`)

  const { data: result, error: resultError } = await admin
    .from('analysis_results')
    .insert({
      organization_id: org.id,
      job_id: job.id,
      response_id: response.id,
      sentiment: 'negative',
      sentiment_confidence: 0.9,
      prompt_version: 'analysis.v1',
      model_id: 'probe',
    })
    .select('id')
    .single()
  if (resultError) throw new Error(`results(${label}): ${resultError.message}`)

  const { data: report, error: reportError } = await admin
    .from('reports')
    .insert({
      organization_id: org.id,
      job_id: job.id,
      summary: `ringkasan rahasia ${label}`,
    })
    .select('id')
    .single()
  if (reportError) throw new Error(`reports(${label}): ${reportError.message}`)

  return {
    label,
    email,
    password,
    userId,
    orgId: org.id,
    datasetId: dataset.id,
    responseId: response.id,
    jobId: job.id,
    resultId: result.id,
    reportId: report.id,
  }
}

async function cleanup(tenants) {
  for (const tenant of tenants) {
    if (!tenant) continue
    await admin.from('organizations').delete().eq('id', tenant.orgId)
    await admin.auth.admin.deleteUser(tenant.userId)
  }
}

const tenants = []

try {
  tenants.push(await seedTenant('a'), await seedTenant('b'))
  const [a, b] = tenants

  // The browser's client: anon key, user A's session, RLS fully in force.
  const asA = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await asA.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  })
  if (signInError) throw new Error(`signIn(a): ${signInError.message}`)

  // ── Sanity: A must be able to see A. A test that passes because the whole
  //    query is broken proves nothing.
  const own = await asA.from('datasets').select('id').eq('id', a.datasetId)
  check('user A can read their own dataset', own.data?.length === 1)

  // ── Reads across the tenant boundary ────────────────────────────────
  const reads = [
    ['organizations', 'id', b.orgId],
    ['organization_members', 'organization_id', b.orgId],
    ['datasets', 'id', b.datasetId],
    ['responses', 'id', b.responseId],
    ['analysis_jobs', 'id', b.jobId],
    ['analysis_results', 'id', b.resultId],
    ['reports', 'id', b.reportId],
  ]

  for (const [table, column, value] of reads) {
    const { data, error } = await asA.from(table).select('*').eq(column, value)
    // RLS filters rather than refuses, so "allowed but empty" is the pass.
    const leaked = (data ?? []).length
    check(
      `user A cannot read ${table} of org B`,
      leaked === 0,
      error ? `error: ${error.message}` : `${leaked} row(s) returned`,
    )
  }

  // A bare select with no filter must not spill the other tenant either.
  const allDatasets = await asA.from('datasets').select('id, organization_id')
  check(
    'an unfiltered dataset listing contains only org A',
    (allDatasets.data ?? []).every((row) => row.organization_id === a.orgId),
    `${(allDatasets.data ?? []).length} row(s) visible`,
  )

  const allResponses = await asA.from('responses').select('id, organization_id')
  check(
    'an unfiltered response listing contains only org A',
    (allResponses.data ?? []).every((row) => row.organization_id === a.orgId),
    `${(allResponses.data ?? []).length} row(s) visible`,
  )

  // ── Writes across the tenant boundary ───────────────────────────────
  const rename = await asA
    .from('organizations')
    .update({ name: 'diambil alih' })
    .eq('id', b.orgId)
    .select('id')
  check(
    'user A cannot rename org B',
    (rename.data ?? []).length === 0,
    rename.error ? `error: ${rename.error.message}` : 'no rows updated',
  )

  const insert = await asA
    .from('datasets')
    .insert({
      organization_id: b.orgId,
      uploader_id: a.userId,
      name: 'penyusup',
      source: 'csv',
    })
    .select('id')
  check('user A cannot insert a dataset into org B', Boolean(insert.error))

  const del = await asA.from('datasets').delete().eq('id', b.datasetId).select('id')
  check(
    'user A cannot delete org B data',
    (del.data ?? []).length === 0,
    del.error ? `error: ${del.error.message}` : 'no rows deleted',
  )

  // ── The rate limit table must be invisible to every signed-in user ──
  const limits = await asA.from('rate_limits').select('*')
  if (limits.error?.message?.includes('Could not find the table')) {
    skip(
      'rate_limits is not readable by a signed-in user',
      'table does not exist yet — apply 20260924000100_rate_limits.sql',
    )
  } else {
    check(
      'rate_limits is not readable by a signed-in user',
      (limits.data ?? []).length === 0,
      limits.error ? `error: ${limits.error.message}` : 'empty',
    )
  }

  // ── Settings, members and profile (20260929000100) ───────────────────
  const settingsProbe = await asA.from('profiles').select('user_id').limit(1)
  if (settingsProbe.error?.message?.includes('Could not find the table')) {
    skip(
      'profiles, invitations and membership writes',
      'tables do not exist yet — apply 20260929000100_settings_members_profile.sql',
    )
  } else {
    const probeHash = `probe-${stamp}`
    const probeLogo = `org/${b.orgId}/probe-${stamp}.png`
    await admin.from('profiles').upsert({ user_id: b.userId, display_name: 'Rahasia B' })
    await admin.from('organization_invitations').insert({
      organization_id: b.orgId,
      email: `undangan-${stamp}@samosa.test`,
      role: 'member',
      token_hash: probeHash,
      invited_by: b.userId,
    })
    await admin.storage
      .from('branding')
      .upload(probeLogo, new Uint8Array([137, 80, 78, 71]), { contentType: 'image/png' })

    const profileB = await asA.from('profiles').select('user_id').eq('user_id', b.userId)
    check(
      'user A cannot read the profile of someone in org B',
      (profileB.data ?? []).length === 0,
      profileB.error ? `error: ${profileB.error.message}` : 'empty',
    )

    const invitesB = await asA
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', b.orgId)
    check(
      'user A cannot read the invitations of org B',
      (invitesB.data ?? []).length === 0,
      invitesB.error ? `error: ${invitesB.error.message}` : 'empty',
    )

    const hashes = await asA.from('organization_invitations').select('token_hash')
    check('invitation token hashes are not readable by anyone', Boolean(hashes.error))

    const rolesB = await asA
      .from('organization_members')
      .update({ role: 'viewer' })
      .eq('organization_id', b.orgId)
      .select('user_id')
    check(
      'user A cannot change roles in org B',
      (rolesB.data ?? []).length === 0,
      rolesB.error ? `error: ${rolesB.error.message}` : 'no rows updated',
    )

    const ownerRow = await asA
      .from('organization_members')
      .update({ role: 'viewer' })
      .eq('user_id', a.userId)
      .select('user_id')
    check(
      'the owner row cannot be edited directly, even by the owner',
      (ownerRow.data ?? []).length === 0,
      ownerRow.error ? `error: ${ownerRow.error.message}` : 'no rows updated',
    )

    const join = await asA
      .from('organization_members')
      .insert({ user_id: a.userId, organization_id: b.orgId, role: 'member' })
    check('nobody can insert a membership directly', Boolean(join.error))

    const logo = await asA
      .from('organizations')
      .update({ logo_path: probeLogo })
      .eq('id', a.orgId)
      .select('id')
    check('logo_path cannot be pointed at another tenant', Boolean(logo.error))

    const takeover = await asA.rpc('transfer_organization_ownership', {
      p_organization_id: b.orgId,
      p_new_owner: a.userId,
    })
    check('user A cannot take org B by ownership transfer', Boolean(takeover.error))

    const accepted = await asA.rpc('accept_organization_invitation', {
      p_token_hash: probeHash,
    })
    check('an invitation for another address cannot be accepted', Boolean(accepted.error))

    const download = await asA.storage.from('branding').download(probeLogo)
    check(
      'the branding bucket is not readable with the anon key',
      Boolean(download.error),
    )

    await admin.storage.from('branding').remove([probeLogo])
  }

  // ── And an anonymous caller must see nothing at all ──────────────────
  const anonymous = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anonRead = await anonymous.from('datasets').select('id')
  check(
    'a signed-out caller sees no datasets',
    (anonRead.data ?? []).length === 0,
    anonRead.error ? `error: ${anonRead.error.message}` : 'empty',
  )

  await asA.auth.signOut()
} catch (error) {
  console.error('\nProbe aborted:', error.message)
  failures += 1
} finally {
  await cleanup(tenants)
  console.log('\ncleaned up probe tenants')
}

console.log(
  `\n${results.length - failures}/${results.length} checks passed` +
    (skipped > 0 ? `, ${skipped} skipped` : ''),
)
process.exit(failures > 0 ? 1 : 0)
