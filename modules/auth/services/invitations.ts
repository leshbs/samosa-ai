import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { InvitableRole } from '@/types/domain'
import { can } from '../policies/org-policy'
import { purgeOrganizationBranding } from './branding'
import { emailsFor, type MemberActor } from './members'

/**
 * Invitations by link (checklist 5.3). The link carries a random token; the
 * database keeps only its SHA-256, so the table leaking is not the links
 * leaking. The token is shown once, to the person who created it.
 *
 * Acceptance is a database function, not code here, because it may have to
 * drop the invitee's own empty organization in the same transaction — see
 * accept_organization_invitation in the migration.
 */

/** Matches the column default; the email and the UI both quote it. */
export const INVITATION_TTL_DAYS = 7

/** 256 bits, base64url so it survives being pasted into any chat app. */
export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * "b***@gmail.com": enough for the person holding the link to recognise the
 * address, not enough for someone who found it to learn one.
 */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

export type InvitationView = {
  id: string
  email: string
  role: InvitableRole
  createdAt: string
  expiresAt: string
  expired: boolean
}

type InvitationRow = {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
}

function toView(row: InvitationRow, now = Date.now()): InvitationView {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as InvitableRole,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    expired: new Date(row.expires_at).getTime() < now,
  }
}

const VIEW_COLUMNS = 'id, email, role, created_at, expires_at'

/** Neither accepted nor cancelled. Expired ones stay listed so they can be re-sent. */
export async function listPendingInvitations(
  organizationId: string,
): Promise<Result<InvitationView[], AppError>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_invitations')
    .select(VIEW_COLUMNS)
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Undangan tidak bisa dimuat'))
  }
  return ok((data ?? []).map((row) => toView(row)))
}

export type CreatedInvitation = { invitation: InvitationView; token: string }

export async function createInvitation(
  actor: MemberActor,
  input: { email: string; role: InvitableRole },
): Promise<Result<CreatedInvitation, AppError>> {
  if (!can(actor.role, 'member:invite')) {
    return err(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengundang anggota'))
  }

  const email = input.email.trim().toLowerCase()
  const supabase = await createClient()

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', actor.organizationId)
  const memberEmails = await emailsFor((members ?? []).map((row) => String(row.user_id)))
  if ([...memberEmails.values()].some((existing) => existing.toLowerCase() === email)) {
    return err(appError(ERROR_CODES.CONFLICT, `${email} sudah menjadi anggota`))
  }

  // One live link per address: re-inviting replaces the old link rather than
  // leaving two that both work.
  await supabase
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', actor.organizationId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)

  const token = createInvitationToken()
  const { data, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: actor.organizationId,
      email,
      role: input.role,
      token_hash: hashInvitationToken(token),
      invited_by: actor.userId,
    })
    .select(VIEW_COLUMNS)
    .single()

  if (error || !data) {
    logger.warn('auth.invitation.create_failed', { code: error?.code })
    return err(appError(ERROR_CODES.INTERNAL, 'Undangan tidak bisa dibuat. Coba lagi.'))
  }

  logger.info('auth.invitation.created', { organizationId: actor.organizationId })
  return ok({ invitation: toView(data), token })
}

export async function revokeInvitation(
  actor: MemberActor,
  invitationId: string,
): Promise<Result<void, AppError>> {
  if (!can(actor.role, 'member:invite')) {
    return err(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa membatalkan undangan'))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('organization_id', actor.organizationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    return err(
      appError(ERROR_CODES.INTERNAL, 'Undangan tidak bisa dibatalkan. Coba lagi.'),
    )
  }
  if (!data || data.length === 0) {
    return err(
      appError(
        ERROR_CODES.NOT_FOUND,
        'Undangan ini sudah dipakai, dibatalkan, atau tidak ada',
      ),
    )
  }
  return ok(undefined)
}

export type InvitationStatus =
  'pending' | 'expired' | 'revoked' | 'accepted' | 'not_found'

export type InvitationPreview = {
  status: InvitationStatus
  organizationName: string
  role: InvitableRole | null
  inviterName: string
  emailHint: string
  expiresAt: string | null
}

const NOT_FOUND_PREVIEW: InvitationPreview = {
  status: 'not_found',
  organizationName: '',
  role: null,
  inviterName: '',
  emailHint: '',
  expiresAt: null,
}

/**
 * What the invite page shows before anyone signs in. Service role, because the
 * visitor may have no account yet; the token is the only credential, and it
 * reveals no more than the email it was sent in already did.
 */
export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  try {
    const supabase = createAdminClient()
    const { data: invite } = await supabase
      .from('organization_invitations')
      .select(
        'organization_id, email, role, invited_by, expires_at, accepted_at, revoked_at',
      )
      .eq('token_hash', hashInvitationToken(token))
      .maybeSingle()

    if (!invite) return NOT_FOUND_PREVIEW

    const [{ data: organization }, { data: inviter }] = await Promise.all([
      supabase
        .from('organizations')
        .select('name')
        .eq('id', invite.organization_id)
        .maybeSingle(),
      invite.invited_by
        ? supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', invite.invited_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const status: InvitationStatus = invite.accepted_at
      ? 'accepted'
      : invite.revoked_at
        ? 'revoked'
        : new Date(invite.expires_at).getTime() < Date.now()
          ? 'expired'
          : 'pending'

    return {
      status,
      organizationName: organization?.name ?? 'Organisasi',
      role: invite.role as InvitableRole,
      inviterName: inviter?.display_name?.trim() ?? '',
      emailHint: maskEmail(invite.email),
      expiresAt: invite.expires_at,
    }
  } catch {
    return NOT_FOUND_PREVIEW
  }
}

const ACCEPT_ERRORS: Record<string, AppError> = {
  invitation_not_found: appError(
    ERROR_CODES.NOT_FOUND,
    'Undangan tidak ditemukan. Minta tautan baru ke pengurus yang mengundangmu.',
  ),
  invitation_used: appError(
    ERROR_CODES.CONFLICT,
    'Undangan ini sudah dipakai akun lain.',
  ),
  invitation_revoked: appError(
    ERROR_CODES.CONFLICT,
    'Undangan ini sudah dibatalkan. Minta undangan baru kalau masih perlu.',
  ),
  invitation_expired: appError(
    ERROR_CODES.CONFLICT,
    `Undangan ini sudah kedaluwarsa — berlakunya ${INVITATION_TTL_DAYS} hari. Minta undangan baru.`,
  ),
  invitation_email_mismatch: appError(
    ERROR_CODES.FORBIDDEN,
    'Undangan ini untuk email lain. Keluar, lalu masuk dengan email yang diundang.',
  ),
  membership_conflict: appError(
    ERROR_CODES.CONFLICT,
    'Akunmu sudah tergabung di organisasi lain yang berisi data. Serahkan atau hapus organisasi itu dulu, atau minta pengurusnya mengeluarkanmu.',
  ),
  not_authenticated: appError(
    ERROR_CODES.UNAUTHORIZED,
    'Masuk dulu untuk menerima undangan.',
  ),
}

function acceptError(message: string): AppError {
  const code = Object.keys(ACCEPT_ERRORS).find((key) => message.includes(key))
  return code
    ? (ACCEPT_ERRORS[code] as AppError)
    : appError(ERROR_CODES.INTERNAL, 'Undangan tidak bisa diterima. Coba lagi.')
}

/** Joins the signed-in caller to the organization the token names. */
export async function acceptInvitation(
  token: string,
): Promise<Result<{ organizationId: string }, AppError>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_organization_invitation', {
    p_token_hash: hashInvitationToken(token),
  })

  const joined = data?.[0]
  if (error || !joined) {
    logger.warn('auth.invitation.accept_failed', { code: error?.code })
    return err(acceptError(error?.message ?? ''))
  }

  // The function dropped the invitee's own empty organization; its row is gone,
  // so the only thing left of it is a logo someone may have uploaded.
  if (joined.dropped_organization_id) {
    await purgeOrganizationBranding(joined.dropped_organization_id)
  }

  logger.info('auth.invitation.accepted', {
    organizationId: joined.joined_organization_id,
  })
  return ok({ organizationId: joined.joined_organization_id })
}
