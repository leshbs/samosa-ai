import { acceptInvitation } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { acceptInvitationSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

/**
 * Joins the signed-in caller to the invitation's organization. No
 * getSessionUser() here on purpose: the caller may have no organization of
 * their own yet, and the database function reads auth.uid() itself.
 */
export async function POST(request: Request) {
  const parsed = acceptInvitationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Tautan undangan tidak valid'))
  }

  const result = await acceptInvitation(parsed.data.token)
  return result.ok ? success(result.value) : failure(result.error)
}
