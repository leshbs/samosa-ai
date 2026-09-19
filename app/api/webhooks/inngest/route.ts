import type { NextRequest } from 'next/server'
import { runJob } from '@/modules/analysis'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

/** Analysis of a 500-row dataset runs for minutes, well past the default limit. */
export const maxDuration = 300

/**
 * Worker entry point. Replace the shared-secret check with the Inngest signing
 * handler once the job queue is wired up (see docs/adr/0002-async-jobs.md).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-worker-secret')
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Invalid worker credentials'))
  }

  const body = (await request.json()) as { jobId?: string }
  if (!body.jobId) {
    return failure(appError(ERROR_CODES.VALIDATION, 'jobId is required'))
  }

  logger.info('worker.job.received', { jobId: body.jobId })
  const result = await runJob(body.jobId)

  return result.ok ? success(result.value) : failure(result.error)
}
