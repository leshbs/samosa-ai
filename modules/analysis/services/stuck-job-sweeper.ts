import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * How long a job may sit in `running` before it is presumed dead.
 *
 * The route that starts a job caps itself at `maxDuration = 300` (five
 * minutes), so anything past ten has either been killed mid-flight or is
 * running somewhere no longer connected to this row. The gap between the two
 * numbers is deliberate: sweeping at six minutes would race a slow-but-healthy
 * job and fail work that was about to land.
 */
export const STUCK_AFTER_MS = 10 * 60 * 1000

export const STUCK_JOB_MESSAGE =
  'Analisis berhenti di tengah jalan dan tidak bisa dilanjutkan. Coba jalankan lagi.'

export type SweepOutcome = {
  sweptJobIds: string[]
}

/**
 * Fails jobs that have been `running` for longer than any real job could be.
 *
 * This exists because `after()` gives no delivery guarantee (ADR-0006): if the
 * invocation dies between claiming the job and writing a terminal status, the
 * row stays `running` forever and the report page waits on a job that will
 * never finish. Nothing else in the system notices.
 *
 * It marks them failed rather than retrying. A retry would have to guess why
 * the job stopped, and the most likely reason — the dataset is big enough to
 * outlive the invocation — is one that a retry reproduces exactly. Failing
 * loudly and letting a person press the button again is the behaviour we can
 * reason about during a pilot. The run guard in `runJob` means the swept job
 * is never re-run in place; retrying creates a new job, so the failed attempt
 * stays visible.
 */
export async function sweepStuckJobs(
  now: Date = new Date(),
): Promise<Result<SweepOutcome, AppError>> {
  const supabase = createAdminClient()
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString()

  /**
   * Scoped by `status` as well as `started_at` so the update cannot touch a job
   * that reached a terminal status between the cutoff being computed and the
   * statement running.
   */
  const { data, error } = await supabase
    .from('analysis_jobs')
    .update({
      status: 'failed',
      error_message: STUCK_JOB_MESSAGE,
      finished_at: now.toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id')

  if (error) {
    logger.error('analysis.sweep.failed')
    return err(appError(ERROR_CODES.INTERNAL, 'Job yang tersangkut tidak bisa disapu'))
  }

  const sweptJobIds = (data ?? []).map((row) => String(row.id))

  // Quiet on the common path: a sweep that finds nothing is the healthy case
  // and would otherwise write a line every five minutes forever.
  if (sweptJobIds.length > 0) {
    logger.warn('analysis.sweep.jobs_failed', {
      count: sweptJobIds.length,
      cutoff,
    })
  }

  return ok({ sweptJobIds })
}
