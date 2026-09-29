import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { ORG_ROLES, type InvitableRole, type OrgRole } from '@/types/domain'
import { can } from '../policies/org-policy'
import { signBrandingUrls } from './branding'
import { confirmationMatches } from './organization'

export type MemberView = {
  userId: string
  email: string
  displayName: string
  title: string
  role: OrgRole
  joinedAt: string
  avatarUrl: string | null
}

/**
 * The people in an organization, owner first.
 *
 * The list itself is read under RLS, so only a member gets one. Emails come
 * from auth.users, which no RLS policy can open, so they are looked up with
 * the service role — but only for user ids the RLS-scoped query returned.
 */
export async function listMembers(
  organizationId: string,
): Promise<Result<MemberView[], AppError>> {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('organization_id', organizationId)

  if (error || !rows) {
    return err(appError(ERROR_CODES.INTERNAL, 'Daftar anggota tidak bisa dimuat'))
  }

  const ids = rows.map((row) => String(row.user_id))
  const [{ data: profiles }, emails] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, display_name, title, avatar_path')
      .in('user_id', ids),
    emailsFor(ids),
  ])

  const profileById = new Map((profiles ?? []).map((row) => [String(row.user_id), row]))
  const avatarUrls = await signBrandingUrls(
    (profiles ?? []).map((profile) => profile.avatar_path),
  )

  const members = rows.map((row): MemberView => {
    const userId = String(row.user_id)
    const profile = profileById.get(userId)
    const avatarPath = profile?.avatar_path ?? null
    return {
      userId,
      email: emails.get(userId) ?? '',
      displayName: profile?.display_name?.trim() ?? '',
      title: profile?.title ?? '',
      role: row.role as OrgRole,
      joinedAt: String(row.created_at),
      avatarUrl: avatarPath ? (avatarUrls.get(avatarPath) ?? null) : null,
    }
  })

  return ok(members.sort(byRoleThenName))
}

function byRoleThenName(a: MemberView, b: MemberView): number {
  const rank = ORG_ROLES.indexOf(a.role) - ORG_ROLES.indexOf(b.role)
  if (rank !== 0) return rank
  return (a.displayName || a.email).localeCompare(b.displayName || b.email, 'id')
}

/** A school committee is a dozen people; one lookup each is fine. */
export async function emailsFor(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const entries = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      return [id, data.user?.email ?? ''] as const
    }),
  )
  return new Map(entries)
}

export type MemberActor = {
  userId: string
  organizationId: string
  organizationName: string
  role: OrgRole
}

function requireMemberManager(actor: MemberActor): Result<void, AppError> {
  return can(actor.role, 'member:manage')
    ? ok(undefined)
    : err(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengelola anggota'))
}

/**
 * Your own role is not changed from the member list: an admin demoting
 * themselves to viewer by a misclick has no way back without the owner.
 */
function refuseSelf(actor: MemberActor, targetUserId: string): Result<void, AppError> {
  return actor.userId === targetUserId
    ? err(
        appError(
          ERROR_CODES.VALIDATION,
          'Peran dan keanggotaanmu sendiri tidak diubah dari sini',
        ),
      )
    : ok(undefined)
}

/**
 * Under RLS: the policy refuses the owner's row and any change *to* owner,
 * which is what makes zero rows here mean "not allowed" as much as "missing".
 */
export async function changeMemberRole(
  actor: MemberActor,
  targetUserId: string,
  role: InvitableRole,
): Promise<Result<{ userId: string; role: InvitableRole }, AppError>> {
  const allowed = requireMemberManager(actor)
  if (!allowed.ok) return allowed
  const notSelf = refuseSelf(actor, targetUserId)
  if (!notSelf.ok) return notSelf

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('organization_id', actor.organizationId)
    .eq('user_id', targetUserId)
    .select('user_id')

  if (error) {
    logger.warn('auth.member.role_change_failed', { code: error.code })
    return err(appError(ERROR_CODES.INTERNAL, 'Peran tidak bisa diubah. Coba lagi.'))
  }
  if (!data || data.length === 0) {
    return err(
      appError(
        ERROR_CODES.NOT_FOUND,
        'Anggota ini tidak ditemukan, atau perannya hanya bisa berubah lewat serah terima kepemilikan',
      ),
    )
  }
  return ok({ userId: targetUserId, role })
}

/**
 * Removes a member. Their account survives: signing in again gives them a
 * fresh organization of their own, the same repair path as any account whose
 * membership is gone.
 */
export async function removeMember(
  actor: MemberActor,
  targetUserId: string,
): Promise<Result<void, AppError>> {
  const allowed = requireMemberManager(actor)
  if (!allowed.ok) return allowed
  const notSelf = refuseSelf(actor, targetUserId)
  if (!notSelf.ok) return notSelf

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', actor.organizationId)
    .eq('user_id', targetUserId)
    .select('user_id')

  if (error) {
    logger.warn('auth.member.remove_failed', { code: error.code })
    return err(
      appError(ERROR_CODES.INTERNAL, 'Anggota tidak bisa dikeluarkan. Coba lagi.'),
    )
  }
  if (!data || data.length === 0) {
    return err(
      appError(
        ERROR_CODES.NOT_FOUND,
        'Anggota ini tidak ditemukan, atau tidak bisa dikeluarkan',
      ),
    )
  }
  return ok(undefined)
}

const TRANSFER_ERRORS: Record<string, AppError> = {
  not_owner: appError(
    ERROR_CODES.FORBIDDEN,
    'Hanya pemilik yang bisa menyerahkan kepemilikan',
  ),
  same_user: appError(
    ERROR_CODES.VALIDATION,
    'Pilih anggota lain untuk menerima kepemilikan',
  ),
  not_a_member: appError(
    ERROR_CODES.NOT_FOUND,
    'Penerima harus sudah menjadi anggota organisasi ini',
  ),
  not_authenticated: appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'),
}

function transferError(message: string): AppError {
  const code = Object.keys(TRANSFER_ERRORS).find((key) => message.includes(key))
  return code
    ? (TRANSFER_ERRORS[code] as AppError)
    : appError(ERROR_CODES.INTERNAL, 'Kepemilikan tidak bisa diserahkan. Coba lagi.')
}

/**
 * Hands the organization to another member (checklist 5.2). The database
 * function swaps both roles in one transaction; the old owner stays as admin.
 * The typed organization name is the second of the two confirmation steps and
 * is checked here, not only in the dialog.
 */
export async function transferOwnership(
  actor: MemberActor,
  newOwnerId: string,
  confirmation: string,
): Promise<Result<{ previousOwnerId: string; newOwnerId: string }, AppError>> {
  if (!can(actor.role, 'org:manage')) {
    return err(TRANSFER_ERRORS.not_owner as AppError)
  }
  if (!confirmationMatches(confirmation, actor.organizationName)) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Nama yang diketik tidak sama dengan nama organisasi',
      ),
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_organization_ownership', {
    p_organization_id: actor.organizationId,
    p_new_owner: newOwnerId,
  })

  if (error) {
    logger.warn('auth.ownership.transfer_failed', { code: error.code })
    return err(transferError(error.message))
  }

  logger.info('auth.ownership.transferred', { organizationId: actor.organizationId })
  return ok({ previousOwnerId: actor.userId, newOwnerId })
}
