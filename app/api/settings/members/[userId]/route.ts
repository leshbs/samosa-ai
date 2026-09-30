import { z } from 'zod'
import { changeMemberRole, getSessionUser, removeMember } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { updateMemberSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ userId: string }> }

async function targetId(context: RouteContext): Promise<string | null> {
  const { userId } = await context.params
  return z.string().uuid().safeParse(userId).success ? userId : null
}

/** Owner and admin; RLS refuses the owner's row and any change *to* owner. */
export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const userId = await targetId(context)
  if (!userId) return failure(appError(ERROR_CODES.VALIDATION, 'Anggota tidak valid'))

  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Peran tidak valid'))
  }

  const result = await changeMemberRole(session.value, userId, parsed.data.role)
  return result.ok ? success(result.value) : failure(result.error)
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const userId = await targetId(context)
  if (!userId) return failure(appError(ERROR_CODES.VALIDATION, 'Anggota tidak valid'))

  const result = await removeMember(session.value, userId)
  return result.ok ? success({ userId }) : failure(result.error)
}
