import { can, getSessionUser } from '@/modules/auth'
import { reportPdfPayload } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import {
  citedQuotes,
  loadExportContext,
  loadReportExport,
} from '@/app/api/_lib/report-data'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * The report as data for "Unduh PDF": the browser draws the file from this
 * (ADR-0014), so the server's part is one read, the same one the print page
 * makes. Archived reports are included for the same reason they are there:
 * the download is how a report is got out before retention deletes it.
 */
export async function GET(request: Request, context: RouteContext) {
  const log = requestLog(request, 'GET /api/reports/[id]/document')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'report:export')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengekspor laporan'))
  }

  const { id } = await context.params
  const bundle = await loadReportExport(id, await loadExportContext(session.value), {
    includeArchived: true,
  })
  if (!bundle.ok) {
    log.warn('api.export.document.failed', { jobId: id, code: bundle.error.code })
    return failure(bundle.error)
  }

  log.info('api.export.document.sent', { jobId: id })

  const response = success(
    reportPdfPayload(bundle.value.document, citedQuotes(bundle.value)),
  )
  response.headers.set('cache-control', 'no-store')
  return response
}
