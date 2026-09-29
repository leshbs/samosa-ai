import { can, getSessionUser } from '@/modules/auth'
import { exportReportToPdf } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import { loadExportContext, loadReportExport } from '@/app/api/_lib/report-data'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/** Rendering a few pages of vector text; well inside the default limit. */
export const maxDuration = 60

export async function GET(request: Request, context: RouteContext) {
  const log = requestLog(request, 'GET /api/reports/[id]/pdf')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'report:export')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengekspor laporan'))
  }

  const { id } = await context.params
  const bundle = await loadReportExport(id, await loadExportContext(session.value))
  if (!bundle.ok) {
    log.warn('api.export.pdf.failed', { jobId: id, code: bundle.error.code })
    return failure(bundle.error)
  }

  const pdf = await exportReportToPdf(bundle.value.document)
  if (!pdf.ok) {
    log.error('api.export.pdf.render_failed', { jobId: id })
    return failure(pdf.error)
  }

  log.info('api.export.pdf.sent', { jobId: id, bytes: pdf.value.bytes.byteLength })

  return new Response(new Uint8Array(pdf.value.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdf.value.fileName}"`,
      // A report changes when it is regenerated; never serve a stale one.
      'cache-control': 'no-store',
    },
  })
}
