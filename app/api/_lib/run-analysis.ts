import { runJob } from '@/modules/analysis'
import { generateReportSummary } from '@/modules/reporting'
import { logger } from '@/modules/shared'

/**
 * Analysis then narrative, in that order, in one place.
 *
 * Both entry points that start work — the request-triggered `after()` and the
 * worker webhook — need the same two steps, and the app layer is where the two
 * modules may be composed: reporting depends on analysis, so analysis calling
 * reporting itself would close a cycle.
 */
export async function runAnalysisJob(jobId: string) {
  return runJob(jobId, {
    onResultsReady: async ({ organizationId }) => {
      const summary = await generateReportSummary({ organizationId, jobId })
      if (!summary.ok) {
        // Charts and the explorer render from the results either way; the
        // report page offers a Regenerate button for exactly this case.
        logger.warn('reporting.summary.failed', { jobId, code: summary.error.code })
      }
    },
  })
}
