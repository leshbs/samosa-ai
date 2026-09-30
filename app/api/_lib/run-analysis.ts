import { runJob } from '@/modules/analysis'
import { generateReportSummary } from '@/modules/reporting'
import { ERROR_CODES, logger } from '@/modules/shared'
import { notifyAnalysisFinished } from './notify'

/**
 * Analysis, then narrative, then the email to whoever started it — in that
 * order, in one place.
 *
 * Both entry points that start work — the request-triggered `after()` and the
 * worker webhook — need the same two steps, and the app layer is where the two
 * modules may be composed: reporting depends on analysis, so analysis calling
 * reporting itself would close a cycle.
 */
export async function runAnalysisJob(jobId: string) {
  const outcome = await runJob(jobId, {
    onResultsReady: async ({ organizationId }) => {
      const summary = await generateReportSummary({ organizationId, jobId })
      if (!summary.ok) {
        // Charts and the explorer render from the results either way; the
        // report page offers a Regenerate button for exactly this case.
        logger.warn('reporting.summary.failed', { jobId, code: summary.error.code })
      }
    },
  })

  // Only the invocation that actually ran the job announces it. The other two
  // outcomes — another invocation already claimed it, or it does not exist —
  // either have their own announcer or nothing to announce.
  const ranHere =
    outcome.ok ||
    (outcome.error.code !== ERROR_CODES.CONFLICT &&
      outcome.error.code !== ERROR_CODES.NOT_FOUND)
  if (ranHere) await notifyAnalysisFinished(jobId)

  return outcome
}
