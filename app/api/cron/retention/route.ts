import type { NextRequest } from 'next/server'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'
import { runRetentionSweep } from '@/app/api/_lib/retention-sweep'

/** A handful of queries and at most one email per workspace per day. */
export const maxDuration = 60

/**
 * The daily retention sweep (`vercel.json`): notices, archiving, deletion and
 * restoring — see `runRetentionSweep`.
 *
 * Same gate as the stuck-job sweep, and fail-closed for a stronger reason:
 * this endpoint can delete data. With no `CRON_SECRET` it refuses to run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    logger.error('cron.retention.unconfigured')
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Cron secret is not configured'))
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Invalid cron credentials'))
  }

  const result = await runRetentionSweep()
  return result.ok ? success(result.value) : failure(result.error)
}
