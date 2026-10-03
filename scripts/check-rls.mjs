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

  // Every organization hangs off an account (ADR-0012), so that comes first.
  const { data: account, error: accountError } = await admin
    .from('accounts')
    .insert({ owner_id: userId })
    .select('id')
    .single()
  if (accountError) throw new Error(`accounts(${label}): ${accountError.message}`)
  accountIds.push(account.id)

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: `RLS Probe ${label} ${stamp}`,
      slug: `rls-probe-${label}-${stamp}`,
      account_id: account.id,
    })
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
    accountId: account.id,
    orgId: org.id,
    datasetId: dataset.id,
    responseId: response.id,
    jobId: job.id,
    resultId: result.id,
    reportId: report.id,
  }
}

async function cleanup(tenants) {
  for (const orgId of extraOrgIds) {
    await admin.from('organizations').delete().eq('id', orgId)
  }
  for (const tenant of tenants) {
    if (!tenant) continue
    await admin.from('organizations').delete().eq('id', tenant.orgId)
    await admin.auth.admin.deleteUser(tenant.userId)
  }
  // Last: an account cannot go while an organization still points at it, and
  // deleting its owner only empties owner_id.
  for (const accountId of accountIds) {
    await admin.from('accounts').delete().eq('id', accountId)
  }
}

const tenants = []
/** Organizations and accounts made outside seedTenant, for cleanup. */
const extraOrgIds = []
const accountIds = []

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

  // ── Accounts (20261001000100) ────────────────────────────────────────
  const ownAccount = await asA.from('accounts').select('id, plan')
  check(
    'user A reads their own account, and only that',
    ownAccount.data?.length === 1 && ownAccount.data[0].id === a.accountId,
    ownAccount.error
      ? `error: ${ownAccount.error.message}`
      : `${(ownAccount.data ?? []).length} row(s) visible`,
  )

  const upgrade = await asA
    .from('accounts')
    .update({ plan: 'enterprise' })
    .eq('id', a.accountId)
    .select('id')
  check('user A cannot change their own plan', Boolean(upgrade.error))

  const lifted = await asA
    .from('accounts')
    .update({ limits: { maxWorkspaces: 99 } })
    .eq('id', a.accountId)
    .select('id')
  check('user A cannot lift their own limits', Boolean(lifted.error))

  const minted = await asA.from('accounts').insert({ plan: 'org' }).select('id')
  check('nobody creates an account from the browser', Boolean(minted.error))

  const moved = await asA
    .from('organizations')
    .update({ account_id: b.accountId })
    .eq('id', a.orgId)
    .select('id')
  check('a workspace cannot be moved onto another account', Boolean(moved.error))

  const { data: after } = await admin
    .from('accounts')
    .select('plan, limits')
    .eq('id', a.accountId)
    .single()
  check(
    'the account is unchanged after all of that',
    after?.plan === 'free' && Object.keys(after?.limits ?? {}).length === 0,
    JSON.stringify(after),
  )

  // 20261002000200: pasted only after the code is deployed, so its absence is
  // a step still to do rather than a failure.
  const orphan = await admin
    .from('organizations')
    .insert({ name: `RLS Probe orphan ${stamp}`, slug: `rls-probe-orphan-${stamp}` })
    .select('id')
    .single()
  if (orphan.error) {
    check('an organization cannot exist without an account', true, orphan.error.code)
  } else {
    extraOrgIds.push(orphan.data.id)
    skip(
      'an organization cannot exist without an account',
      'account_id is still nullable — apply 20261002000200_account_required.sql once the code is deployed',
    )
  }

  // ── Two workspaces, one person (ADR-0012) ────────────────────────────
  // RLS admits every workspace a person is in, so it cannot keep two of them
  // apart on one page; only the filter on the active workspace does. The first
  // check documents that, the rest prove the filter is enough.
  const { data: second, error: secondError } = await admin
    .from('organizations')
    .insert({
      name: `RLS Probe a2 ${stamp}`,
      slug: `rls-probe-a2-${stamp}`,
      account_id: b.accountId,
    })
    .select('id')
    .single()
  if (secondError) throw new Error(`organizations(a2): ${secondError.message}`)
  extraOrgIds.push(second.id)

  const { error: secondMemberError } = await admin
    .from('organization_members')
    .insert({ user_id: a.userId, organization_id: second.id, role: 'member' })
  if (secondMemberError) throw new Error(`members(a2): ${secondMemberError.message}`)

  const { error: secondDatasetError } = await admin.from('datasets').insert({
    organization_id: second.id,
    uploader_id: a.userId,
    name: 'probe-a2',
    source: 'csv',
  })
  if (secondDatasetError) throw new Error(`datasets(a2): ${secondDatasetError.message}`)

  const both = await asA.from('datasets').select('organization_id')
  const visibleOrgs = new Set((both.data ?? []).map((row) => row.organization_id))
  check(
    'RLS alone shows a person both of their workspaces',
    visibleOrgs.size === 2 && visibleOrgs.has(a.orgId) && visibleOrgs.has(second.id),
    `${visibleOrgs.size} workspace(s) visible`,
  )

  const narrowed = await asA
    .from('datasets')
    .select('organization_id')
    .eq('organization_id', second.id)
  check(
    'the workspace filter narrows a listing to one',
    (narrowed.data ?? []).length === 1 &&
      narrowed.data.every((row) => row.organization_id === second.id),
    `${(narrowed.data ?? []).length} row(s) visible`,
  )

  const crossed = await asA
    .from('datasets')
    .select('id')
    .eq('organization_id', second.id)
    .eq('id', a.datasetId)
  check(
    'a dataset of one workspace is not found under the other',
    (crossed.data ?? []).length === 0,
    `${(crossed.data ?? []).length} row(s) returned`,
  )

  const stillClosed = await asA.from('datasets').select('id').eq('id', b.datasetId)
  check(
    'a second workspace does not open org B',
    (stillClosed.data ?? []).length === 0,
    `${(stillClosed.data ?? []).length} row(s) returned`,
  )

  // ── Joining adds, leaving is allowed (20261002000100) ────────────────
  const signature = await asA.rpc('accept_organization_invitation', {
    p_token_hash: `probe-missing-${stamp}`,
    p_leave_organization_id: second.id,
  })
  if (!/invitation_not_found/.test(signature.error?.message ?? '')) {
    skip(
      'joining adds and never deletes; a member can leave',
      'accept_organization_invitation has no p_leave_organization_id — apply 20261002000100_join_and_leave.sql',
    )
  } else {
    const joinHash = `probe-join-${stamp}`
    const { error: inviteError } = await admin.from('organization_invitations').insert({
      organization_id: b.orgId,
      email: a.email,
      role: 'viewer',
      token_hash: joinHash,
      invited_by: b.userId,
    })
    if (inviteError) throw new Error(`invitation(join): ${inviteError.message}`)

    const ownerSwap = await asA.rpc('accept_organization_invitation', {
      p_token_hash: joinHash,
      p_leave_organization_id: a.orgId,
    })
    check(
      'an owner cannot give up their own workspace to join another',
      /owner_cannot_leave/.test(ownerSwap.error?.message ?? ''),
      ownerSwap.error?.message ?? 'accepted',
    )

    const swapped = await asA.rpc('accept_organization_invitation', {
      p_token_hash: joinHash,
      p_leave_organization_id: second.id,
    })
    const swap = swapped.data?.[0]
    check(
      'accepting joins org B and leaves the workspace named',
      swap?.joined_organization_id === b.orgId &&
        swap?.left_organization_id === second.id,
      swapped.error?.message ?? JSON.stringify(swapped.data),
    )

    const { data: memberships } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', a.userId)
    const roleIn = Object.fromEntries(
      (memberships ?? []).map((row) => [row.organization_id, row.role]),
    )
    check(
      'user A still owns their own workspace, and joined as invited',
      roleIn[a.orgId] === 'owner' && roleIn[b.orgId] === 'viewer' && !roleIn[second.id],
      JSON.stringify(roleIn),
    )

    const kept = await admin
      .from('datasets')
      .select('id', { count: 'exact', head: true })
      .in('organization_id', [a.orgId, second.id])
    check(
      'joining deleted nothing: both workspaces keep their datasets',
      kept.count === 2,
      `${kept.count} dataset(s)`,
    )

    const ownerLeaves = await asA
      .from('organization_members')
      .delete()
      .eq('user_id', a.userId)
      .eq('organization_id', a.orgId)
      .select('user_id')
    check(
      'an owner cannot leave their own workspace',
      (ownerLeaves.data ?? []).length === 0,
      ownerLeaves.error ? ownerLeaves.error.message : 'no rows deleted',
    )

    const evict = await asA
      .from('organization_members')
      .delete()
      .eq('user_id', b.userId)
      .eq('organization_id', b.orgId)
      .select('user_id')
    check(
      'a viewer cannot remove someone else',
      (evict.data ?? []).length === 0,
      evict.error ? evict.error.message : 'no rows deleted',
    )

    const left = await asA
      .from('organization_members')
      .delete()
      .eq('user_id', a.userId)
      .eq('organization_id', b.orgId)
      .select('user_id')
    check(
      'a member can leave a workspace they do not own',
      (left.data ?? []).length === 1,
      left.error ? left.error.message : `${(left.data ?? []).length} row(s) deleted`,
    )

    const closedAgain = await asA.from('datasets').select('id').eq('id', b.datasetId)
    check(
      'after leaving, org B is closed again',
      (closedAgain.data ?? []).length === 0,
      `${(closedAgain.data ?? []).length} row(s) returned`,
    )
  }

  // ── Retention (20261003000100) ───────────────────────────────────────
  const clock = await admin
    .from('datasets')
    .select('retention_clock_at')
    .eq('id', a.datasetId)
    .single()
  if (clock.error) {
    skip(
      'retention state cannot be changed from the browser',
      'datasets.retention_clock_at does not exist — apply 20261003000100_retention.sql',
    )
  } else {
    const reset = await asA
      .from('datasets')
      .update({ retention_clock_at: new Date().toISOString() })
      .eq('id', a.datasetId)
      .select('id')
    check(
      'user A cannot reset the retention clock on their own dataset',
      (reset.data ?? []).length === 0,
      reset.error ? reset.error.message : 'no rows updated',
    )

    await admin
      .from('datasets')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', a.datasetId)
    const unarchive = await asA
      .from('datasets')
      .update({ archived_at: null })
      .eq('id', a.datasetId)
      .select('id')
    check(
      'user A cannot un-archive a dataset',
      (unarchive.data ?? []).length === 0,
      unarchive.error ? unarchive.error.message : 'no rows updated',
    )

    const hide = await asA
      .from('analysis_jobs')
      .update({ archived_at: null })
      .eq('id', a.jobId)
      .select('id')
    check(
      'user A cannot change whether a report is archived',
      (hide.data ?? []).length === 0,
      hide.error ? hide.error.message : 'no rows updated',
    )

    const { data: state } = await admin
      .from('datasets')
      .select('retention_clock_at, archived_at')
      .eq('id', a.datasetId)
      .single()
    check(
      'the retention state is unchanged after all of that',
      state?.retention_clock_at === clock.data.retention_clock_at &&
        state?.archived_at !== null,
      JSON.stringify(state),
    )
    await admin.from('datasets').update({ archived_at: null }).eq('id', a.datasetId)
  }

  // ── Non-answers (20261004000100) ─────────────────────────────────────
  const counted = await admin
    .from('analysis_jobs')
    .update({ no_content_count: 7 })
    .eq('id', a.jobId)
    .select('no_content_count')
  if (counted.error) {
    skip(
      'the non-answer count is read-only from the browser',
      'analysis_jobs.no_content_count does not exist — apply 20261004000100_no_content_count.sql',
    )
  } else {
    const readable = await asA
      .from('analysis_jobs')
      .select('no_content_count')
      .eq('id', a.jobId)
      .single()
    check(
      'user A can read the non-answer count on their report',
      readable.data?.no_content_count === 7,
      readable.error?.message ?? JSON.stringify(readable.data),
    )
    const rewrite = await asA
      .from('analysis_jobs')
      .update({ no_content_count: 0 })
      .eq('id', a.jobId)
      .select('id')
    check(
      'user A cannot rewrite the non-answer count',
      (rewrite.data ?? []).length === 0,
      rewrite.error ? rewrite.error.message : 'no rows updated',
    )
  }

  // ── Questions (20261005000100) ───────────────────────────────────────
  const ownQuestions = await asA
    .from('dataset_questions')
    .select('id, dataset_id, question_text, analysis_mode')
  if (ownQuestions.error) {
    skip(
      "a dataset's questions are readable by its workspace only",
      'dataset_questions does not exist — apply 20261005000100_dataset_questions.sql',
    )
  } else {
    // The probe's response was stored the way the code before this migration
    // stores one: naming no question and no respondent.
    const { data: seeded } = await admin
      .from('responses')
      .select('question_id, respondent_index')
      .eq('id', a.responseId)
      .single()
    check(
      'a response stored without a question is given the dataset default',
      Boolean(seeded?.question_id) && seeded?.respondent_index === 0,
      JSON.stringify(seeded),
    )
    check(
      'user A can read the questions of their own dataset',
      (ownQuestions.data ?? []).some(
        (question) =>
          question.dataset_id === a.datasetId && question.analysis_mode === 'evaluative',
      ),
      `${(ownQuestions.data ?? []).length} rows`,
    )
    check(
      "user A cannot read another organization's questions",
      (ownQuestions.data ?? []).every((question) => question.dataset_id !== b.datasetId),
      `${(ownQuestions.data ?? []).length} rows`,
    )

    const reworded = await asA
      .from('dataset_questions')
      .update({ question_text: 'diubah dari browser' })
      .eq('dataset_id', a.datasetId)
      .select('id')
    check(
      'user A cannot rewrite a question from the browser',
      (reworded.data ?? []).length === 0,
      reworded.error ? reworded.error.message : 'no rows updated',
    )
    const added = await asA
      .from('dataset_questions')
      .insert({
        dataset_id: a.datasetId,
        organization_id: a.orgId,
        column_name: 'Sisipan',
        question_text: 'Sisipan',
        position: 9,
      })
      .select('id')
    check(
      'or add one',
      Boolean(added.error) || (added.data ?? []).length === 0,
      added.error ? added.error.message : `${(added.data ?? []).length} rows`,
    )

    const recounted = await asA
      .from('analysis_jobs')
      .update({ question_counts: { probe: { analyzed: 1, no_content: 0, failed: 0 } } })
      .eq('id', a.jobId)
      .select('id')
    check(
      'user A cannot rewrite the per-question counts',
      (recounted.data ?? []).length === 0,
      recounted.error ? recounted.error.message : 'no rows updated',
    )

    // The read the report makes: results with their response embedded.
    const embedded = await asA
      .from('analysis_results')
      .select('response_id, responses (text, question_id, respondent_index)')
      .eq('job_id', a.jobId)
      .order('id', { ascending: true })
      .range(0, 999)
    const joined = embedded.data?.[0]?.responses
    const response = Array.isArray(joined) ? joined[0] : joined
    check(
      'the report reads each result with its text and its question in one request',
      !embedded.error &&
        response?.text === `rahasia organisasi ${a.label}` &&
        response?.question_id === seeded?.question_id,
      embedded.error ? embedded.error.message : JSON.stringify(response),
    )
    const foreign = await asA
      .from('analysis_results')
      .select('response_id, responses (text)')
      .eq('job_id', b.jobId)
    check(
      "and never another organization's",
      (foreign.data ?? []).length === 0,
      foreign.error ? foreign.error.message : `${(foreign.data ?? []).length} rows`,
    )
  }

  // ── Handing over moves the bill (20261002000300) ─────────────────────
  // Last, because it changes who owns org A.
  await admin
    .from('organization_members')
    .insert({ user_id: b.userId, organization_id: a.orgId, role: 'member' })
  const handover = await asA.rpc('transfer_organization_ownership', {
    p_organization_id: a.orgId,
    p_new_owner: b.userId,
  })
  const { data: handed } = await admin
    .from('organizations')
    .select('account_id')
    .eq('id', a.orgId)
    .single()
  if (handover.error) {
    check('an owner can hand their workspace over', false, handover.error.message)
  } else if (handed?.account_id === a.accountId) {
    skip(
      "a handed-over workspace leaves the old owner's account",
      'the transfer does not move the account — apply 20261002000300_transfer_moves_account.sql',
    )
  } else {
    check(
      "a handed-over workspace leaves the old owner's account",
      handed?.account_id === b.accountId,
      `now on ${handed?.account_id === b.accountId ? "the new owner's" : 'an unexpected'} account`,
    )
    const { data: kept } = await admin
      .from('accounts')
      .select('owner_id')
      .eq('id', a.accountId)
      .single()
    check(
      'the old owner keeps their own account, and nobody has two',
      kept?.owner_id === a.userId,
      JSON.stringify(kept),
    )
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
