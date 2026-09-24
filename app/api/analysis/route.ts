import { after, type NextRequest } from 'next/server'
import { can, getSessionUser } from '@/modules/auth'
import { createJob } from '@/modules/analysis'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { createAnalysisSchema } from '@/types/api'
import { runAnalysisJob } from '@/app/api/_lib/run-analysis'
import { failure, success } from '@/app/api/_lib/respond'

/** A 500-row dataset takes minutes; the default limit would cut it short. */
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'analysis:run')) {
    return failure(
      appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa menjalankan analisis'),
    )
  }

  // Each run is billed per batch, so the ceiling is on starting one — not on
  // reading the result afterwards.
  const budget = await enforceRateLimit('analysis:start', session.value.organizationId)
  if (!budget.ok) return failure(budget.error)

  const parsed = createAnalysisSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Permintaan analisis tidak valid', {
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
   * runAnalysisJob records its own failures on the job row, so nothing here can throw
   * into a response that has already been sent.
   */
  after(async () => {
    const outcome = await runAnalysisJob(jobId)
    if (!outcome.ok) {
      logger.error('analysis.job.run_failed', { jobId, code: outcome.error.code })
    }
  })

  return success({ jobId, status: result.value.status }, 202)
}
