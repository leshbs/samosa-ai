import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { slugify, withSuffix } from './slug'

/** Postgres reports a violated unique index with this code. */
const UNIQUE_VIOLATION = '23505'
const SLUG_ATTEMPTS = 5

/**
 * The billing account this person owns, created on first need (ADR-0012). One
 * per person: deleting a workspace and making another must land on the same
 * account, or a plan would be lost by starting over.
 *
 * Returns null instead of failing. The accounts migration is pasted in by
 * hand, and refusing every sign-up until someone has done so would be the
 * wrong trade for a row that nothing reads yet — an organization without an
 * account resolves to the free plan.
 */
async function ensureAccount(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const lookup = () =>
    supabase.from('accounts').select('id').eq('owner_id', userId).maybeSingle()

  const existing = await lookup()
  if (existing.data) return String(existing.data.id)
  if (existing.error) {
    logger.warn('auth.account.unavailable', { code: existing.error.code })
    return null
  }

  const created = await supabase
    .from('accounts')
    .insert({ owner_id: userId })
    .select('id')
    .single()
  if (created.data) return String(created.data.id)

  // Two first sign-ins racing: the other one won the unique index.
  if (created.error?.code === UNIQUE_VIOLATION) {
    const raced = await lookup()
    if (raced.data) return String(raced.data.id)
  }

  logger.warn('auth.account.create_failed', { code: created.error?.code })
  return null
}

export type ProvisionInput = {
  userId: string
  organizationName: string
}

/**
 * Gives a brand-new account an organization to work in.
 *
 * This has to run with the service role: RLS lets only existing members insert
 * into organization_members, and a user signing up is by definition not one yet.
 * The caller must therefore have already authenticated `userId` itself.
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

  // Re-running signup (or a confirmation link opened twice) must not add a second org.
  if (existing.data) {
    return ok({ organizationId: String(existing.data.organization_id) })
  }

  const base = slugify(input.organizationName)
  const accountId = await ensureAccount(supabase, input.userId)

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : withSuffix(base, crypto.randomUUID().slice(0, 6))

    const { data, error } = await supabase
      .from('organizations')
      .insert({
        name: input.organizationName,
        slug,
        ...(accountId ? { account_id: accountId } : {}),
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      logger.error('auth.organization.create_failed', { code: error.code })
      return err(appError(ERROR_CODES.INTERNAL, 'Organisasi kamu tidak bisa dibuat'))
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

  return err(
    appError(ERROR_CODES.CONFLICT, 'Tidak ada nama organisasi yang masih tersedia'),
  )
}
