import { acceptInvitation } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { acceptInvitationSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

/**
 * Joins the signed-in caller to the invitation's organization. No
 * getSessionUser() here on purpose: the caller may have no workspace at all,
 * and the database function reads auth.uid() itself. `leave` is the caller
 * agreeing to give up the organization they follow now; which one that is, is
 * worked out on the server.
 */
export async function POST(request: Request) {
  const parsed = acceptInvitationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Tautan undangan tidak valid'))
  }

  const result = await acceptInvitation(parsed.data.token, { leave: parsed.data.leave })
  return result.ok ? success(result.value) : failure(result.error)
}
