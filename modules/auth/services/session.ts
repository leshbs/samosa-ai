import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  DEFAULT_TIME_ZONE,
  isOrgTimeZone,
  type OrgRole,
  type OrgTimeZone,
} from '@/types/domain'

export type AuthUser = {
  userId: string
  email: string
}

export type SessionUser = {
  userId: string
  email: string
  /** Profile first, then auth metadata; empty until the user sets one. */
  displayName: string
  /** Free-text position, e.g. "Sekretaris OSIS 2026/2027". Empty when unset. */
  title: string
  /** Storage path, not a URL; signed on demand by the branding service. */
  avatarPath: string | null
  organizationId: string
  organizationName: string
  /** Every date the app prints for this organization is in this zone. */
  organizationTimezone: OrgTimeZone
  role: OrgRole
  /**
   * `true` when the account can sign in with a password. A Google-only account
   * has no password to change, and its email is owned by Google.
   */
  hasPassword: boolean
}

/**
 * The signed-in identity on its own. Signup needs this before an organization
 * exists, so it cannot go through getSessionUser().
 */
export async function getAuthUser(): Promise<Result<AuthUser, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }

  return ok({ userId: data.user.id, email: data.user.email ?? '' })
}

/** Supabase lists every linked sign-in method in `app_metadata.providers`. */
function hasEmailIdentity(providers: unknown): boolean {
  return Array.isArray(providers) && providers.includes('email')
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Resolves the signed-in user together with their organization. Every server
 * entry point starts here — organizationId is what all RLS policies scope to.
 *
 * The organization is read with `*` and the profile is optional on purpose.
 * The dashboard layout calls this on every page, so a query naming a column
 * that a pending migration has not added yet would take down every page, not
 * just the settings one that uses it. Missing columns fall back to defaults.
 */
async function loadSessionUser(): Promise<Result<SessionUser, AppError>> {
  const supabase = await createClient()

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', auth.user.id)
    .limit(1)
    .single()

  if (membershipError || !membership) {
    return err(appError(ERROR_CODES.FORBIDDEN, 'Akunmu belum punya organisasi'))
  }

  const organizationId = String(membership.organization_id)

  // Separate round-trips rather than a nested select: types/database.ts is
  // hand-written and declares no relationships for the client to infer.
  const [{ data: organization }, { data: profile }] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', organizationId).single(),
    supabase
      .from('profiles')
      .select('display_name, title, avatar_path')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
  ])

  const timezone: unknown = organization?.timezone

  return ok({
    userId: auth.user.id,
    email: auth.user.email ?? '',
    displayName:
      text(profile?.display_name).trim() || text(auth.user.user_metadata?.full_name),
    title: text(profile?.title),
    avatarPath: profile?.avatar_path ?? null,
    organizationId,
    organizationName: organization?.name ?? 'Organisasi',
    organizationTimezone: isOrgTimeZone(timezone) ? timezone : DEFAULT_TIME_ZONE,
    role: membership.role as OrgRole,
    hasPassword: hasEmailIdentity(auth.user.app_metadata?.providers),
  })
}

/**
 * Memoized per server render: the layout and the page both ask, and each ask
 * is four round trips. Outside a render (route handlers, tests) `cache` passes
 * straight through.
 */
export const getSessionUser = cache(loadSessionUser)

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session.ok) throw new Error(session.error.message)
  return session.value
}
