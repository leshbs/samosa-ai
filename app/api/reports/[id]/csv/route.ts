import { can, getSessionUser } from '@/modules/auth'
import { exportResponsesToCsv } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import { loadExportContext, loadReportExport } from '@/app/api/_lib/report-data'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const log = requestLog(request, 'GET /api/reports/[id]/csv')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'report:export')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengekspor laporan'))
  }

  const { id } = await context.params
  const bundle = await loadReportExport(
    id,
    await loadExportContext(session.value, { logo: false }),
  )
  if (!bundle.ok) {
    log.warn('api.export.csv.failed', { jobId: id, code: bundle.error.code })
    return failure(bundle.error)
  }

  const fileName = bundle.value.document.datasetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  log.info('api.export.csv.sent', { jobId: id, rows: bundle.value.rows.length })

  return new Response(exportResponsesToCsv(bundle.value.rows), {
    headers: {
      // charset matters as much as the BOM: without it some readers still
      // guess ANSI and turn every "dinaikkan" apostrophe into mojibake.
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="samosa-${fileName || 'aspirasi'}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
