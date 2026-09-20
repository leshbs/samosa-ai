import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { slugify, withSuffix } from './slug'

/** Postgres reports a violated unique index with this code. */
const UNIQUE_VIOLATION = '23505'
const SLUG_ATTEMPTS = 5

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

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : withSuffix(base, crypto.randomUUID().slice(0, 6))

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: input.organizationName, slug })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      logger.error('auth.organization.create_failed', { code: error.code })
      return err(appError(ERROR_CODES.INTERNAL, 'Could not create your organization'))
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
      return err(appError(ERROR_CODES.INTERNAL, 'Could not set up your account'))
    }

    logger.info('auth.organization.created', { organizationId })
    return ok({ organizationId })
  }

  return err(
    appError(ERROR_CODES.CONFLICT, 'Could not find a free name for your organization'),
  )
}
