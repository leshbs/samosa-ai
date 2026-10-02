import { createInvitation, getSessionUser } from '@/modules/auth'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError } from '@/modules/shared'
import { createInvitationSchema } from '@/types/api'
import { invitationUrl, sendInvitationEmail } from '@/app/api/_lib/notify'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

/**
 * Creates an invitation and returns its link — once. The link works whether
 * or not email is on, so a committee without a sending domain can still pass
 * it along in a group chat; when email is on it is also sent.
 */
export async function POST(request: Request) {
  const log = requestLog(request, 'POST /api/settings/invitations')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const budget = await enforceRateLimit('member:invite', session.value.organizationId)
  if (!budget.ok) return failure(budget.error)

  const parsed = createInvitationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Undangan tidak valid', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const created = await createInvitation(session.value, parsed.data)
  if (!created.ok) return failure(created.error)

  const { invitation, token, organizationName } = created.value
  const email = await sendInvitationEmail({
    to: invitation.email,
    token,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    // The first invitation may have just named the organization; the email
    // must carry that name, not the placeholder the session was loaded with.
    inviter: { ...session.value, organizationName },
  })
  log.info('api.invitation.created', { email })

  return success({ invitation, url: invitationUrl(token), email }, 201)
}
