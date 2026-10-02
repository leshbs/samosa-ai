import 'server-only'

import { resolveLimits, withinLimit } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { setActiveWorkspace } from './active-workspace'
import { slugify, withSuffix } from './slug'

/** Postgres reports a violated unique index with this code. */
const UNIQUE_VIOLATION = '23505'
const SLUG_ATTEMPTS = 5

type Admin = ReturnType<typeof createAdminClient>

type Account = { id: string; plan: unknown; limits: unknown }

/**
 * The billing account this person owns, created on first need (ADR-0012). One
 * per person: deleting a workspace and making another must land on the same
 * account, or a plan would be lost by starting over.
 */
async function ensureAccount(
  supabase: Admin,
  userId: string,
): Promise<Result<Account, AppError>> {
  const lookup = () =>
    supabase
      .from('accounts')
      .select('id, plan, limits')
      .eq('owner_id', userId)
      .maybeSingle()

  const existing = await lookup()
  if (existing.data) return ok(existing.data)

  if (!existing.error) {
    const created = await supabase
      .from('accounts')
      .insert({ owner_id: userId })
      .select('id, plan, limits')
      .single()
    if (created.data) return ok(created.data)

    // Two first sign-ins racing: the other one won the unique index.
    if (created.error?.code === UNIQUE_VIOLATION) {
      const raced = await lookup()
      if (raced.data) return ok(raced.data)
    }
    logger.error('auth.account.create_failed', { code: created.error?.code })
  } else {
    logger.error('auth.account.unavailable', { code: existing.error.code })
  }

  return err(appError(ERROR_CODES.INTERNAL, 'Akun kamu tidak bisa disiapkan'))
}

/** Always creates: the caller has already decided this person gets a new one. */
async function createOrganization(
  supabase: Admin,
  input: ProvisionInput,
  accountId: string,
): Promise<Result<{ organizationId: string }, AppError>> {
  const base = slugify(input.organizationName)

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : withSuffix(base, crypto.randomUUID().slice(0, 6))

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: input.organizationName, slug, account_id: accountId })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      logger.error('auth.organization.create_failed', { code: error.code })
      return err(appError(ERROR_CODES.INTERNAL, 'Ruang kerja kamu tidak bisa dibuat'))
    }

    const organizationId = String(data.id)
    const membership = await supabase.from('organization_members').insert({
      user_id: input.userId,
      organization_id: organizationId,
      role: 'owner',
    })

    if (membership.error) {
      // Leave no orphan organization that nobody can reach.
      await supabase.from('organizations').delete().eq('id', organizationId)
      logger.error('auth.membership.create_failed', { code: membership.error.code })
      return err(appError(ERROR_CODES.INTERNAL, 'Akun kamu tidak bisa disiapkan'))
    }

    logger.info('auth.organization.created', { organizationId })
    return ok({ organizationId })
  }

  return err(appError(ERROR_CODES.CONFLICT, 'Tidak ada nama yang masih tersedia'))
}

export type ProvisionInput = {
  userId: string
  organizationName: string
}

/**
 * Gives a person arriving for the first time a workspace of their own. A no-op
 * for anyone who is already in one, so a confirmation link opened twice does
 * not make two.
 *
 * This has to run with the service role: RLS lets nobody insert into
 * organization_members, and a user signing up is by definition not a member
 * yet. The caller must therefore have already authenticated `userId` itself —
 * and decided that this *is* a first arrival (see completeSignIn).
 */
export async function provisionOrganization(
  input: ProvisionInput,
): Promise<Result<{ organizationId: string }, AppError>> {
  const supabase = createAdminClient()

  const existing = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', input.userId)
    .limit(1)
    .maybeSingle()

  if (existing.data) {
    return ok({ organizationId: String(existing.data.organization_id) })
  }

  const account = await ensureAccount(supabase, input.userId)
  if (!account.ok) return account

  return createOrganization(supabase, input, account.value.id)
}

/**
 * A workspace somebody asked for: the welcome page of a person who has none,
 * or a member of someone else's organization starting their own.
 *
 * How many a person may own is the plan's `maxWorkspaces`, counted per
 * account: handing a workspace over takes it off the account (see
 * transfer_organization_ownership), so the count is what they still pay for.
 */
export async function createWorkspace(
  name: string,
): Promise<Result<{ organizationId: string }, AppError>> {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }
  const userId = auth.user.id

  const supabase = createAdminClient()
  const account = await ensureAccount(supabase, userId)
  if (!account.ok) return account

  const owned = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.value.id)
  if (owned.error) {
    return err(
      appError(ERROR_CODES.INTERNAL, 'Ruang kerja tidak bisa dibuat. Coba lagi.'),
    )
  }

  const { maxWorkspaces } = resolveLimits(account.value.plan, account.value.limits)
  if (!withinLimit(maxWorkspaces, owned.count ?? 0)) {
    return err(
      appError(
        ERROR_CODES.CONFLICT,
        maxWorkspaces === 1
          ? 'Kamu sudah punya ruang kerja sendiri. Paketmu mencakup satu.'
          : `Paketmu mencakup ${maxWorkspaces} ruang kerja, dan semuanya sudah terpakai.`,
      ),
    )
  }

  const created = await createOrganization(
    supabase,
    { userId, organizationName: name },
    account.value.id,
  )
  // The person asked for this one, so it is the one they land in.
  if (created.ok) await setActiveWorkspace(created.value.organizationId)
  return created
}
