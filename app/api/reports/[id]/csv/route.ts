import { can, getSessionUser } from '@/modules/auth'
import { exportResponsesToCsv } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import { loadReportExport } from '@/app/api/_lib/report-data'
import { failure } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'report:export')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengekspor laporan'))
  }

  const { id } = await context.params
  const bundle = await loadReportExport(id, session.value.organizationName)
  if (!bundle.ok) return failure(bundle.error)

  const fileName = bundle.value.document.datasetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

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
