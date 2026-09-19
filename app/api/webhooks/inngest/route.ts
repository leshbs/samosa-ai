import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { verifyWorkerSecret } from '@/lib/worker-auth'
import { runJob } from '@/modules/analysis'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

/** Analysis of a 500-row dataset runs for minutes, well past the default limit. */
export const maxDuration = 300

const bodySchema = z.object({ jobId: z.string().uuid() })

/**
 * Worker entry point. Replace the shared-secret check with the Inngest signing
 * handler once the job queue is wired up (see docs/adr/0003-async-analysis-jobs.md).
 */
export async function POST(request: NextRequest) {
  if (!verifyWorkerSecret(request.headers.get('x-worker-secret'))) {
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Invalid worker credentials'))
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'jobId must be a UUID'))
  }

  logger.info('worker.job.received', { jobId: body.data.jobId })
  const result = await runJob(body.data.jobId)

  return result.ok ? success(result.value) : failure(result.error)
}
