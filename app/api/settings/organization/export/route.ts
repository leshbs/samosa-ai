import { can, getSessionUser } from '@/modules/auth'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError } from '@/modules/shared'
import { buildOrganizationArchive } from '@/app/api/_lib/organization-archive'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure } from '@/app/api/_lib/respond'

/** One PDF per report, rendered in sequence; a large organization takes a while. */
export const maxDuration = 300

export async function GET(request: Request) {
  const log = requestLog(request, 'GET /api/settings/organization/export')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'org:export')) {
    return failure(
      appError(
        ERROR_CODES.FORBIDDEN,
        'Hanya pemilik dan admin yang bisa mengekspor semua data',
      ),
    )
  }

  const budget = await enforceRateLimit('org:export', session.value.organizationId)
  if (!budget.ok) return failure(budget.error)

  const archive = await buildOrganizationArchive(session.value)
  if (!archive.ok) {
    log.warn('api.export.archive.failed', { code: archive.error.code })
    return failure(archive.error)
  }

  log.info('api.export.archive.sent', {
    bytes: archive.value.bytes.byteLength,
    skipped: archive.value.skipped,
  })

  return new Response(new Uint8Array(archive.value.bytes), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${archive.value.fileName}"`,
      'cache-control': 'no-store',
    },
  })
}
