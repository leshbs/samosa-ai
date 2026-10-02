import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { clientEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { InvitableRole } from '@/types/domain'
import { can } from '../policies/org-policy'
import { setActiveWorkspace } from './active-workspace'
import { emailsFor, type MemberActor } from './members'

/**
 * Invitations by link (checklist 5.3). The link carries a random token; the
 * database keeps only its SHA-256, so the table leaking is not the links
 * leaking. The token is shown once, to the person who created it.
 *
 * Acceptance is a database function, not code here: checking the token,
 * joining, and leaving another workspace in exchange have to be one
 * transaction — see accept_organization_invitation in the migration. It never
 * deletes an organization or its data (ADR-0012).
 */

/**
 * For now a person follows one organization besides the workspace they own.
 * A product rule, enforced here; the schema allows any number.
 */
const MAX_JOINED_WORKSPACES = 1

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
  owner_cannot_leave: appError(
    ERROR_CODES.CONFLICT,
    'Kamu pemilik ruang kerja itu. Serahkan kepemilikannya atau hapus dulu sebelum keluar.',
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

export type WorkspaceToLeave = { organizationId: string; organizationName: string }

/**
 * The workspace the caller would have to leave to accept this invitation, or
 * null when there is room. Workspaces they own never count, and neither does
 * the inviting organization itself.
 *
 * The invite page asks this to word its confirmation; acceptInvitation asks it
 * again, so the answer the browser saw is never the one that is acted on.
 */
export async function findWorkspaceToLeave(
  token: string,
): Promise<WorkspaceToLeave | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const [{ data: memberships }, { data: invite }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('organization_id, role, created_at')
      .eq('user_id', auth.user.id)
      .neq('role', 'owner')
      .order('created_at', { ascending: true }),
    createAdminClient()
      .from('organization_invitations')
      .select('organization_id')
      .eq('token_hash', hashInvitationToken(token))
      .maybeSingle(),
  ])

  const joined = (memberships ?? [])
    .map((row) => String(row.organization_id))
    .filter((id) => id !== invite?.organization_id)
  const leaving = joined[0]
  if (joined.length < MAX_JOINED_WORKSPACES || !leaving) return null

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', leaving)
    .maybeSingle()

  return { organizationId: leaving, organizationName: organization?.name ?? 'Organisasi' }
}

/**
 * Joins the signed-in caller to the organization the token names, and makes it
 * their active workspace. `leave` is the caller confirming that they give up
 * the organization they follow now; without it, an invitation that needs that
 * is refused with a sentence naming the organization.
 */
export async function acceptInvitation(
  token: string,
  options: { leave?: boolean } = {},
): Promise<Result<{ organizationId: string }, AppError>> {
  const leaving = await findWorkspaceToLeave(token)
  if (leaving && !options.leave) {
    return err(
      appError(
        ERROR_CODES.CONFLICT,
        `Kamu sudah mengikuti ${leaving.organizationName}. Untuk bergabung ke sini, konfirmasi dulu bahwa kamu keluar dari sana.`,
      ),
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_organization_invitation', {
    p_token_hash: hashInvitationToken(token),
    ...(leaving ? { p_leave_organization_id: leaving.organizationId } : {}),
  })

  const joined = data?.[0]
  if (error || !joined) {
    logger.warn('auth.invitation.accept_failed', { code: error?.code })
    return err(acceptError(error?.message ?? ''))
  }

  // They came to work in this one; without this a person who also owns a
  // workspace would land back in their own.
  await setActiveWorkspace(joined.joined_organization_id)

  logger.info('auth.invitation.accepted', {
    organizationId: joined.joined_organization_id,
    left: Boolean(joined.left_organization_id),
  })
  return ok({ organizationId: joined.joined_organization_id })
}

export type IncomingInvitation = {
  organizationName: string
  role: InvitableRole
  inviterName: string
  expiresAt: string
}

type Identity = { provider?: string; identity_data?: Record<string, unknown> }

/**
 * Whether the signed-in person has shown they own their address. With email
 * links off, a password signup is never asked to; the only proof left is a
 * Google identity for that same address.
 */
function ownsEmail(email: string, identities: unknown): boolean {
  if (clientEnv.NEXT_PUBLIC_EMAIL_LINKS_ENABLED) return true
  if (!Array.isArray(identities)) return false
  return (identities as Identity[]).some(
    (identity) =>
      identity.provider === 'google' &&
      typeof identity.identity_data?.email === 'string' &&
      identity.identity_data.email.toLowerCase() === email,
  )
}

/**
 * Live invitations addressed to the signed-in person, for the welcome page.
 *
 * Shown, not accepted: the tokens are not stored, and the link is the
 * credential. Service role, because an invitee is not a member and RLS shows
 * invitations only to the admins who sent them — which is why this returns
 * nothing to someone who has not proven the address is theirs. Anyone can sign
 * up as anyone while verification is off, and the list would tell them which
 * organization is expecting that person.
 */
export async function listIncomingInvitations(): Promise<IncomingInvitation[]> {
  const session = await createClient()
  const { data: auth } = await session.auth.getUser()
  const address = auth.user?.email?.trim().toLowerCase()
  if (!auth.user || !address || !ownsEmail(address, auth.user.identities)) return []

  const supabase = createAdminClient()
  const { data: invites, error } = await supabase
    .from('organization_invitations')
    .select('organization_id, role, invited_by, expires_at')
    .eq('email', address)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !invites || invites.length === 0) return []

  const inviterIds = invites
    .map((invite) => invite.invited_by)
    .filter((id): id is string => Boolean(id))
  const [{ data: organizations }, { data: inviters }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name')
      .in(
        'id',
        invites.map((invite) => invite.organization_id),
      ),
    inviterIds.length > 0
      ? supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', inviterIds)
      : Promise.resolve({ data: [] }),
  ])

  const nameOf = new Map((organizations ?? []).map((row) => [row.id, row.name]))
  const inviterOf = new Map(
    (inviters ?? []).map((row) => [row.user_id, row.display_name.trim()]),
  )

  return invites.map((invite) => ({
    organizationName: nameOf.get(invite.organization_id) ?? 'Organisasi',
    role: invite.role as InvitableRole,
    inviterName: (invite.invited_by && inviterOf.get(invite.invited_by)) || '',
    expiresAt: invite.expires_at,
  }))
}
