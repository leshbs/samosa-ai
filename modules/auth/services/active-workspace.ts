import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { OrgRole } from '@/types/domain'

/**
 * Which of a person's workspaces a request is about (ADR-0012).
 *
 * RLS answers "may this user see this row" for every workspace they belong to
 * at once, so it cannot keep two of one person's workspaces apart. The active
 * workspace does: the session resolves it here, and every query filters on it.
 *
 * The cookie is a preference, never a credential. Its value is only ever used
 * to choose among memberships the database returned for the signed-in user, so
 * a forged id selects nothing.
 */
export const ACTIVE_WORKSPACE_COOKIE = 'samosa_workspace'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export type Membership = {
  organizationId: string
  role: OrgRole
  joinedAt: string
}

/**
 * The preferred workspace when the person is still in it; otherwise the one
 * they own, then the one they joined first. Deterministic, so a person with no
 * cookie — a new device, a cleared browser — lands in the same place each time
 * rather than wherever the database happened to return first.
 */
export function pickMembership(
  memberships: readonly Membership[],
  preferredId: string | null | undefined,
): Membership | null {
  if (memberships.length === 0) return null

  const preferred = memberships.find((entry) => entry.organizationId === preferredId)
  if (preferred) return preferred

  const [first] = [...memberships].sort((a, b) => {
    const owned = Number(b.role === 'owner') - Number(a.role === 'owner')
    if (owned !== 0) return owned
    const joined = a.joinedAt.localeCompare(b.joinedAt)
    return joined !== 0 ? joined : a.organizationId.localeCompare(b.organizationId)
  })
  return first ?? null
}

/** Null outside a request (background jobs, tests) and when nothing is stored. */
export async function readActiveWorkspaceId(): Promise<string | null> {
  try {
    return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/**
 * Switches the caller to another of their workspaces. Membership is read under
 * RLS as the caller, so the id of a workspace they are not in is "not found"
 * rather than a cookie that silently falls back.
 *
 * Only callable where cookies can be written: a route handler or server action.
 */
export async function setActiveWorkspace(
  organizationId: string,
): Promise<Result<{ organizationId: string }, AppError>> {
  const supabase = await createClient()

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Ruang kerja tidak ditemukan'))
  }

  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })

  return ok({ organizationId })
}
