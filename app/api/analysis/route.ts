import { after, type NextRequest } from 'next/server'
import { can, getSessionUser } from '@/modules/auth'
import { createJob, runJob } from '@/modules/analysis'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { createAnalysisSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

/** A 500-row dataset takes minutes; the default limit would cut it short. */
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'analysis:run')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot start analyses'))
  }

  const parsed = createAnalysisSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Invalid analysis request', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const result = await createJob({
    organizationId: session.value.organizationId,
    datasetId: parsed.data.datasetId,
    promptVersion: parsed.data.promptVersion,
  })

  if (!result.ok) return failure(result.error)

  const jobId = result.value.id

  /**
   * The 202 goes out now and the work continues in this same invocation
   * (ADR-0003: the client polls /api/analysis/[id]/status for progress).
   * runJob records its own failures on the job row, so nothing here can throw
   * into a response that has already been sent.
   */
  after(async () => {
    const outcome = await runJob(jobId)
    if (!outcome.ok) {
      logger.error('analysis.job.run_failed', { jobId, code: outcome.error.code })
    }
  })

  return success({ jobId, status: result.value.status }, 202)
}
