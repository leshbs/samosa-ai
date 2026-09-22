import { getJob, listJobResults } from '@/modules/analysis'
import { getDataset } from '@/modules/ingestion'
import {
  aggregateKeywords,
  aggregateTopics,
  aggregateSentiment,
  getStoredSummary,
  topResponsesByTopic,
  type ReportDocumentData,
} from '@/modules/reporting'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalysisResultRow } from '@/modules/analysis'
import { formatDateTime } from '@/lib/utils'

/** Topics deep enough to be worth a section, shallow enough to stay readable. */
const TOPICS_IN_EXPORT = 10
const KEYWORDS_IN_EXPORT = 12
const TOPICS_WITH_QUOTES = 5

export type ReportExportBundle = {
  rows: AnalysisResultRow[]
  document: ReportDocumentData
}

/**
 * Assembles everything an export needs, once, from the modules that own each
 * piece. Both download routes want the same bundle, and a route handler is the
 * wrong place to be joining four queries twice.
 *
 * Reads go through the session client, so RLS decides what this user may
 * export — an id from another tenant comes back as "not found".
 */
export async function loadReportExport(
  jobId: string,
  organizationName: string,
): Promise<Result<ReportExportBundle, AppError>> {
  const job = await getJob(jobId)
  if (!job.ok) return job

  const results = await listJobResults(jobId)
  if (!results.ok) return results
  if (results.value.length === 0) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'This job has no results to export'))
  }

  const dataset = await getDataset(job.value.datasetId)
  const summary = await getStoredSummary(job.value.organizationId, jobId)

  const rows = results.value
  const topics = aggregateTopics(rows, TOPICS_IN_EXPORT)

  return ok({
    rows,
    document: {
      organizationName,
      datasetName: dataset.ok ? dataset.value.name : 'Dataset',
      generatedAt: formatDateTime(job.value.createdAt),
      promptVersion: job.value.promptVersion,
      summary: summary?.summary ?? null,
      insights: summary?.insights ?? [],
      sentiment: aggregateSentiment(rows),
      topics,
      keywords: aggregateKeywords(rows, KEYWORDS_IN_EXPORT),
      topResponsesByTopic: topResponsesByTopic(rows, topics.slice(0, TOPICS_WITH_QUOTES)),
    },
  })
}
