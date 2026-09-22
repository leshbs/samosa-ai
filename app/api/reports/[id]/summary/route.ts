import { can, getSessionUser } from '@/modules/auth'
import { generateReportSummary } from '@/modules/reporting'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/** Regenerates the executive summary for one job. `id` is the analysis job id. */
export async function POST(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'analysis:run')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot regenerate summaries'))
  }

  const { id } = await context.params
  const result = await generateReportSummary({
    organizationId: session.value.organizationId,
    jobId: id,
  })

  return result.ok ? success(result.value) : failure(result.error)
}
