import type { NextRequest } from 'next/server'
import { sweepStuckJobs } from '@/modules/analysis'
import { ERROR_CODES, appError, logger } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

/** Sweeping is a single statement; it never needs the analysis budget. */
export const maxDuration = 30

/**
 * Fails analysis jobs that have been `running` far longer than any real job
 * could be. Scheduled once a day (`vercel.json`) — the most Vercel's Hobby plan
 * allows; see docs/DEBT.md.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set. The check is fail-closed: with no secret configured the endpoint
 * refuses rather than running, because an open endpoint that can mark jobs
 * failed is a denial-of-service button.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    logger.error('cron.sweep.unconfigured')
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Cron secret is not configured'))
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return failure(appError(ERROR_CODES.UNAUTHORIZED, 'Invalid cron credentials'))
  }

  const result = await sweepStuckJobs()
  if (!result.ok) return failure(result.error)

  return success({ swept: result.value.sweptJobIds.length })
}
