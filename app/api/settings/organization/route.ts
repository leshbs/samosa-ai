import {
  can,
  deleteOrganization,
  getSessionUser,
  updateOrganization,
} from '@/modules/auth'
import { purgeOrganizationFiles } from '@/modules/ingestion'
import { ERROR_CODES, appError } from '@/modules/shared'
import { deleteOrganizationSchema, updateOrganizationSchema } from '@/types/api'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

/** Name, timezone, report defaults — any subset in one request. */
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
      appError(ERROR_CODES.VALIDATION, 'Pengaturan organisasi tidak valid', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  // The id comes from the session, never the body: a tenant cannot be named
  // by anyone who is not in it.
  const result = await updateOrganization(session.value.organizationId, parsed.data)
  return result.ok ? success(result.value) : failure(result.error)
}

/**
 * Deletes the organization and everything in it (checklist 5.7). The typed
 * name is checked again inside the service; the raw uploads, which live in a
 * bucket no foreign key reaches, are purged once the rows are gone.
 */
export async function DELETE(request: Request) {
  const log = requestLog(request, 'DELETE /api/settings/organization')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const parsed = deleteOrganizationSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Ketik nama organisasi untuk konfirmasi'),
    )
  }

  const result = await deleteOrganization(session.value, parsed.data.confirmation)
  if (!result.ok) return failure(result.error)

  await purgeOrganizationFiles(session.value.organizationId)
  log.info('api.organization.deleted', { organizationId: session.value.organizationId })
  return success({ deleted: true })
}
