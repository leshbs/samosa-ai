import { getSessionUser } from '@/modules/auth'
import { buildReport } from '@/modules/reporting'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

/** `id` is the analysis job id — a report is the aggregated view of one job. */
export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const { id } = await context.params
  const result = await buildReport({
    organizationId: session.value.organizationId,
    jobId: id,
  })

  return result.ok ? success(result.value) : failure(result.error)
}
