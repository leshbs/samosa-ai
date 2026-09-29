import { z } from 'zod'
import { getSessionUser, revokeInvitation } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Undangan tidak valid'))
  }

  const result = await revokeInvitation(session.value, id)
  return result.ok ? success({ id }) : failure(result.error)
}
