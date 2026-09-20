import { z } from 'zod'
import { can, getSessionUser } from '@/modules/auth'
import { deleteDataset } from '@/modules/ingestion'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'dataset:delete')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot delete datasets'))
  }

  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Dataset id must be a UUID'))
  }

  // RLS re-checks ownership, so a valid id from another tenant still 404s.
  const result = await deleteDataset(id)
  return result.ok ? success({ id }) : failure(result.error)
}
