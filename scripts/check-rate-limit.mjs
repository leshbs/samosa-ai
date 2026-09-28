/**
 * Rate limiter probe (checklist A.1).
 *
 *   node --env-file=.env.local scripts/check-rate-limit.mjs
 *
 * Run this after pasting `20260924000100_rate_limits.sql` into the SQL Editor.
 *
 * ## What this proves, and what it does not
 *
 * It exercises `consume_rate_limit` directly with the service role: the table
 * exists, the window counts, the ceiling denies, the window resets, and the
 * function is not callable by a signed-in user. That is the whole of the
 * limiter's behaviour.
 *
 * It does **not** drive `POST /api/analysis` over HTTP. That route reads the
 * session from `@supabase/ssr` cookies, so a script would have to forge the
 * cookie format to get past `getSessionUser()` — and a probe that reimplements
 * the auth layer proves the probe works, not the app. Two consequences worth
 * knowing before testing that path by hand:
 *
 *   1. `enforceRateLimit` runs *after* the session and permission checks, so an
 *      unauthenticated request returns 401 and never reaches the limiter.
 *   2. `allowed` is `count <= limit`, so with a limit of 20 the **21st**
 *      request is the first 429 — exactly 20 requests yields none.
 *
 * The browser check that closes that gap is printed at the end.
 *
 * Every bucket this creates is deleted in a `finally`, including on failure.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error(
    'Missing env. Run with: node --env-file=.env.local scripts/check-rate-limit.mjs',
  )
  process.exit(1)
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = Date.now()
const buckets = []
let failures = 0
let checks = 0

function check(name, passed, detail = '') {
  checks += 1
  if (!passed) failures += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** One call against a throwaway bucket, returning the verdict row. */
async function consume(bucket, limit, windowSeconds = 3600) {
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error(`consume_rate_limit: ${error.message}`)
  return data?.[0]
}

try {
  // ── The table has to exist before anything else means anything ───────
  const probe = await admin.from('rate_limits').select('bucket').limit(1)
  if (probe.error) {
    console.error(
      `\nFAIL  rate_limits is unreachable — ${probe.error.message}\n` +
        '      Paste supabase/migrations/20260924000100_rate_limits.sql into the\n' +
        '      SQL Editor and run this again. Until then the limiter fails open.',
    )
    process.exit(1)
  }
  check('rate_limits table exists and is readable by the service role', true)

  // ── The ceiling: request 20 allowed, request 21 denied ───────────────
  const ceiling = `probe:ceiling:${stamp}`
  buckets.push(ceiling)

  let lastAllowed = null
  for (let i = 1; i <= 20; i += 1) {
    lastAllowed = await consume(ceiling, 20)
  }
  check(
    'the 20th request inside a limit of 20 is still allowed',
    lastAllowed?.allowed === true,
    `remaining ${lastAllowed?.remaining}`,
  )

  const twentyFirst = await consume(ceiling, 20)
  check(
    'the 21st request is denied',
    twentyFirst?.allowed === false,
    `allowed=${twentyFirst?.allowed}, remaining=${twentyFirst?.remaining}`,
  )

  check(
    'remaining never goes below zero',
    (twentyFirst?.remaining ?? -1) >= 0,
    `remaining=${twentyFirst?.remaining}`,
  )

  // ── A denied bucket stays denied ─────────────────────────────────────
  const stillDenied = await consume(ceiling, 20)
  check('a spent budget keeps refusing', stillDenied?.allowed === false)

  // ── Buckets are independent ──────────────────────────────────────────
  const other = `probe:other:${stamp}`
  buckets.push(other)
  const fresh = await consume(other, 20)
  check(
    'a different bucket has its own budget',
    fresh?.allowed === true && fresh?.remaining === 19,
    `remaining ${fresh?.remaining}`,
  )

  // ── An expired window starts over ────────────────────────────────────
  const rolling = `probe:rolling:${stamp}`
  buckets.push(rolling)
  await consume(rolling, 1, 1)
  const blocked = await consume(rolling, 1, 1)
  check('a one-request budget is spent after one request', blocked?.allowed === false)

  await new Promise((resolve) => setTimeout(resolve, 1500))
  const rolled = await consume(rolling, 1, 1)
  check(
    'the window reopens once it has expired',
    rolled?.allowed === true,
    `remaining ${rolled?.remaining}`,
  )

  // ── And a signed-in user must not be able to call it at all ──────────
  const email = `ratelimit-probe-${stamp}@samosa.test`
  const password = `probe-${stamp}`
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (userError) throw new Error(`createUser: ${userError.message}`)

  const asUser = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await asUser.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`)

  const forbidden = await asUser.rpc('consume_rate_limit', {
    p_bucket: `probe:user:${stamp}`,
    p_limit: 20,
    p_window_seconds: 3600,
  })
  check(
    'a signed-in user cannot call consume_rate_limit',
    Boolean(forbidden.error),
    forbidden.error
      ? forbidden.error.message
      : 'the call succeeded — execute is not revoked',
  )

  const readTable = await asUser.from('rate_limits').select('bucket')
  check(
    'a signed-in user cannot read rate_limits',
    (readTable.data ?? []).length === 0,
    readTable.error ? `error: ${readTable.error.message}` : 'empty',
  )

  await asUser.auth.signOut()
  await admin.auth.admin.deleteUser(created.user.id)
} catch (error) {
  console.error('\nProbe aborted:', error.message)
  failures += 1
} finally {
  for (const bucket of buckets) {
    await admin.from('rate_limits').delete().eq('bucket', bucket)
  }
  console.log('\ncleaned up probe buckets')
}

console.log(`\n${checks - failures}/${checks} checks passed`)

if (failures === 0) {
  console.log(
    '\nThe limiter works. To see a real 429 end to end, sign in, open the\n' +
      'browser console on any page of the app, and run:\n\n' +
      '  for (let i = 0; i < 21; i++) {\n' +
      "    const r = await fetch('/api/analysis', {\n" +
      "      method: 'POST',\n" +
      "      headers: { 'content-type': 'application/json' },\n" +
      "      body: '{}',\n" +
      '    })\n' +
      '    console.log(i + 1, r.status)\n' +
      '  }\n\n' +
      'Expect 422 (the empty body failing validation) up to request 20, then\n' +
      '429 from request 21 on. A 422 means the limiter let it through; the\n' +
      'budget is consumed before the body is parsed, which is the point.\n\n' +
      'This spends that org’s analysis budget for an hour, so do it on a\n' +
      'throwaway organisation rather than the one you plan to demo with.',
  )
}

process.exit(failures > 0 ? 1 : 0)
