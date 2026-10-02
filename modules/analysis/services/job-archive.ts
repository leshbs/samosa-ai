import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/modules/shared'

/**
 * The analysis side of retention and of the abuse ceiling (ADR-0012). Service
 * role: both run for an account or from a cron, across workspaces the caller
 * may not be in. The ids come from server code, never from a request.
 */

/**
 * Reports follow their dataset into the archive and back out. `at` null
 * restores. Called before the datasets themselves are archived and after they
 * are restored, so a half-finished sweep hides a report too early rather than
 * showing one whose dataset is gone from the list.
 */
export async function setJobsArchived(
  datasetIds: readonly string[],
  at: Date | null,
): Promise<boolean> {
  if (datasetIds.length === 0) return true
  const { error } = await createAdminClient()
    .from('analysis_jobs')
    .update({ archived_at: at ? at.toISOString() : null })
    .in('dataset_id', [...datasetIds])
  if (error) logger.error('analysis.jobs.archive_failed', { code: error.code })
  return !error
}

/**
 * How many responses these workspaces have put through analysis since `since`.
 * Counted from what each job was asked to analyse (`total_count`), so a run
 * that failed half-way still counts in full: the ceiling is on what was sent
 * to the model, not on what came back. Null when it could not be counted.
 */
export async function countResponsesSubmittedSince(
  organizationIds: readonly string[],
  since: Date,
): Promise<number | null> {
  if (organizationIds.length === 0) return 0
  const { data, error } = await createAdminClient()
    .from('analysis_jobs')
    .select('total_count')
    .in('organization_id', [...organizationIds])
    .gte('created_at', since.toISOString())
  if (error || !data) {
    logger.warn('analysis.jobs.usage_count_failed', { code: error?.code })
    return null
  }
  return data.reduce((sum, row) => sum + Number(row.total_count ?? 0), 0)
}
