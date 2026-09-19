import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { OrgRole } from '@/types/domain'

export type SessionUser = {
  userId: string
  email: string
  organizationId: string
  role: OrgRole
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

  return ok({
    userId: auth.user.id,
    email: auth.user.email ?? '',
    organizationId: String(membership.organization_id),
    role: membership.role as OrgRole,
  })
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session.ok) throw new Error(session.error.message)
  return session.value
}
