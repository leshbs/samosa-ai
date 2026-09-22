import { can, getSessionUser } from '@/modules/auth'
import { exportReportToPdf } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import { loadReportExport } from '@/app/api/_lib/report-data'
import { failure } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/** Rendering a few pages of vector text; well inside the default limit. */
export const maxDuration = 60

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'report:export')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot export reports'))
  }

  const { id } = await context.params
  const bundle = await loadReportExport(id, session.value.organizationName)
  if (!bundle.ok) return failure(bundle.error)

  const pdf = await exportReportToPdf(bundle.value.document)
  if (!pdf.ok) return failure(pdf.error)

  return new Response(new Uint8Array(pdf.value.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdf.value.fileName}"`,
      // A report changes when it is regenerated; never serve a stale one.
      'cache-control': 'no-store',
    },
  })
}
