import { can, getSessionUser } from '@/modules/auth'
import { generateReportSummary } from '@/modules/reporting'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError } from '@/modules/shared'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/** Regenerates the executive summary for one job. `id` is the analysis job id. */
export async function POST(request: Request, context: RouteContext) {
  const log = requestLog(request, 'POST /api/reports/[id]/summary')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'analysis:run')) {
    return failure(
      appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa membuat ulang ringkasan'),
    )
  }

  const budget = await enforceRateLimit('report:summary', session.value.organizationId)
  if (!budget.ok) return failure(budget.error)

  const { id } = await context.params
  const result = await generateReportSummary({
    organizationId: session.value.organizationId,
    jobId: id,
  })

  if (!result.ok) {
    log.warn('api.summary.regenerate_failed', { jobId: id, code: result.error.code })
    return failure(result.error)
  }

  // A paid call the user can press repeatedly; worth a line of its own.
  log.info('api.summary.regenerated', { jobId: id })
  return success(result.value)
}
