import { can, getSessionUser, renameOrganization } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { updateOrganizationSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'org:manage')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengubah organisasi'))
  }

  const parsed = updateOrganizationSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Nama organisasi tidak valid', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  // The id comes from the session, never the body: a tenant cannot be named
  // by anyone who is not in it.
  const result = await renameOrganization(session.value.organizationId, parsed.data.name)
  return result.ok ? success(result.value) : failure(result.error)
}
