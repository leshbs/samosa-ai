import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { OrgRole } from '@/types/domain'

export type AuthUser = {
  userId: string
  email: string
}

export type SessionUser = {
  userId: string
  email: string
  organizationId: string
  organizationName: string
  role: OrgRole
}

/**
 * The signed-in identity on its own. Signup needs this before an organization
 * exists, so it cannot go through getSessionUser().
 */
export async function getAuthUser(): Promise<Result<AuthUser, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'You are not signed in'))
  }

  return ok({ userId: data.user.id, email: data.user.email ?? '' })
}

/**
 * Resolves the signed-in user together with their organization. Every server
 * entry point starts here — organizationId is what all RLS policies scope to.
 */
export async function getSessionUser(): Promise<Result<SessionUser, AppError>> {
  const supabase = await createClient()

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'You are not signed in'))
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', auth.user.id)
    .limit(1)
    .single()

  if (membershipError || !membership) {
    return err(appError(ERROR_CODES.FORBIDDEN, 'Your account has no organization yet'))
  }

  const organizationId = String(membership.organization_id)

  // Separate round-trip rather than a nested select: types/database.ts is
  // hand-written and declares no relationships for the client to infer.
  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single()

  return ok({
    userId: auth.user.id,
    email: auth.user.email ?? '',
    organizationId,
    organizationName: organization?.name ?? 'Organisasi',
    role: membership.role as OrgRole,
  })
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session.ok) throw new Error(session.error.message)
  return session.value
}
