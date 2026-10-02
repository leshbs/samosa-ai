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
import { pickMembership, readActiveWorkspaceId } from './active-workspace'

export type AuthUser = {
  userId: string
  email: string
}

/** One of the signed-in person's workspaces, for the switcher and the profile. */
export type WorkspaceSummary = {
  organizationId: string
  name: string
  role: OrgRole
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
  /**
   * The *active* workspace — the one this request is about — not "the"
   * organization of the account: a person can belong to more than one
   * (ADR-0012). `role` below is their role in this workspace only.
   */
  organizationId: string
  organizationName: string
  /** Every date the app prints for this organization is in this zone. */
  organizationTimezone: OrgTimeZone
  role: OrgRole
  /** Every workspace this person is in, the active one included; owned first. */
  workspaces: WorkspaceSummary[]
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
 * Resolves the signed-in user together with their active workspace. Every
 * server entry point starts here, and passes `organizationId` on to every
 * query: RLS admits all of a person's workspaces, so only that explicit filter
 * keeps one of them out of the other's pages.
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

  // Every membership, not `.limit(1)`: a person may be in two workspaces, and
  // which one this request is about is a choice, not whichever row came first.
  const [{ data: rows, error: membershipError }, preferredId] = await Promise.all([
    supabase
      .from('organization_members')
      .select('organization_id, role, created_at')
      .eq('user_id', auth.user.id),
    readActiveWorkspaceId(),
  ])

  const memberships = (rows ?? []).map((row) => ({
    organizationId: String(row.organization_id),
    role: row.role as OrgRole,
    joinedAt: String(row.created_at),
  }))
  const membership = pickMembership(memberships, preferredId)

  if (membershipError || !membership) {
    return err(appError(ERROR_CODES.FORBIDDEN, 'Akunmu belum punya organisasi'))
  }

  const { organizationId } = membership

  // Separate round-trips rather than a nested select: types/database.ts is
  // hand-written and declares no relationships for the client to infer.
  const [{ data: organizations }, { data: profile }] = await Promise.all([
    supabase
      .from('organizations')
      .select('*')
      .in(
        'id',
        memberships.map((entry) => entry.organizationId),
      ),
    supabase
      .from('profiles')
      .select('display_name, title, avatar_path')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
  ])

  const organizationById = new Map((organizations ?? []).map((row) => [row.id, row]))
  const organization = organizationById.get(organizationId)
  const timezone: unknown = organization?.timezone
  const workspaces = memberships
    .map((entry) => ({
      organizationId: entry.organizationId,
      name: organizationById.get(entry.organizationId)?.name ?? 'Organisasi',
      role: entry.role,
    }))
    .sort(
      (a, b) =>
        Number(b.role === 'owner') - Number(a.role === 'owner') ||
        a.name.localeCompare(b.name, 'id'),
    )

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
    role: membership.role,
    workspaces,
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
