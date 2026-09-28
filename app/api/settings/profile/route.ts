import { getSessionUser, updateDisplayName } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { updateProfileSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

/** Anyone may rename themselves; the session decides whose name it is. */
export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const parsed = updateProfileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Nama tidak valid', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const result = await updateDisplayName(parsed.data.displayName)
  return result.ok ? success(result.value) : failure(result.error)
}
