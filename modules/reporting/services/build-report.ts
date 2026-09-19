import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { Report, Sentiment } from '@/types/domain'
import { aggregateResults } from '../aggregators/report-aggregator'

export type BuildReportInput = {
  organizationId: string
  jobId: string
}

/**
 * Builds the aggregated view the dashboard renders. Cheap and deterministic —
 * the narrative summary is added by the analysis job, not recomputed per view.
 */
export async function buildReport(
  input: BuildReportInput,
): Promise<Result<Report, AppError>> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('analysis_results')
    .select('response_id, sentiment, sentiment_confidence, topics, summary')
    .eq('job_id', input.jobId)
    .eq('organization_id', input.organizationId)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not load analysis results'))
  }
  if (!rows || rows.length === 0) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'No analysis results for this job'))
  }

  const aggregate = aggregateResults(
    rows.map((row) => ({
      responseId: String(row.response_id),
      sentiment: row.sentiment as Sentiment,
      confidence: Number(row.sentiment_confidence),
      topics: (row.topics as string[]) ?? [],
      summary: row.summary === null ? null : String(row.summary),
    })),
  )

  const { data: stored } = await supabase
    .from('reports')
    .select('id, summary, insights, exported_at, created_at')
    .eq('job_id', input.jobId)
    .maybeSingle()

  return ok({
    id: stored ? String(stored.id) : input.jobId,
    organizationId: input.organizationId,
    jobId: input.jobId,
    summary: stored ? String(stored.summary) : '',
    insights: stored ? (stored.insights as Report['insights']) : [],
    sentimentCounts: aggregate.sentimentCounts,
    topics: aggregate.topics,
    exportedAt: stored?.exported_at ? String(stored.exported_at) : null,
    createdAt: stored ? String(stored.created_at) : new Date().toISOString(),
  })
}
