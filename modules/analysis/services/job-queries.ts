import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalysisJob, JobStatus, Sentiment } from '@/types/domain'

/**
 * Reads go through the request-scoped client so RLS scopes them to the
 * caller's organization; none of these take a tenant id.
 */

const JOB_COLUMNS =
  'id, organization_id, dataset_id, status, prompt_version, model_id, processed_count, total_count, failed_count, input_tokens, output_tokens, cost_micro_idr, error_message, started_at, finished_at, created_at'

type JobRow = Record<string, unknown>

function toJob(row: JobRow): AnalysisJob {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    datasetId: String(row.dataset_id),
    status: row.status as JobStatus,
    promptVersion: String(row.prompt_version),
    modelId: row.model_id ? String(row.model_id) : '',
    processedCount: Number(row.processed_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costMicroIdr: Number(row.cost_micro_idr ?? 0),
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    createdAt: String(row.created_at),
  }
}

export type JobListItem = AnalysisJob & { datasetName: string }

export async function listJobs(): Promise<Result<JobListItem[], AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Could not load analysis jobs'))

  const jobs = (data ?? []).map((row) => toJob(row as JobRow))
  if (jobs.length === 0) return ok([])

  // Separate lookup rather than a nested select: types/database.ts is
  // hand-written and declares no relationships for the client to infer.
  const { data: datasets } = await supabase
    .from('datasets')
    .select('id, name')
    .in('id', [...new Set(jobs.map((job) => job.datasetId))])

  const nameById = new Map(
    (datasets ?? []).map((row) => [String(row.id), String(row.name)]),
  )

  return ok(
    jobs.map((job) => ({
      ...job,
      datasetName: nameById.get(job.datasetId) ?? 'Dataset terhapus',
    })),
  )
}

export async function getJob(jobId: string): Promise<Result<AnalysisJob, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle()

  // RLS turns another tenant's job into "no rows", which is what we want.
  if (error || !data)
    return err(appError(ERROR_CODES.NOT_FOUND, 'Analysis job not found'))

  return ok(toJob(data as JobRow))
}

export type AnalysisResultRow = {
  responseId: string
  responseText: string
  sentiment: Sentiment
  confidence: number
  topics: string[]
  keywords: string[]
  summary: string | null
}

/**
 * Results joined back to the text they describe. A sentiment label with no
 * visible aspiration next to it is unreviewable.
 */
export async function listJobResults(
  jobId: string,
): Promise<Result<AnalysisResultRow[], AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_results')
    .select('response_id, sentiment, sentiment_confidence, topics, keywords, summary')
    .eq('job_id', jobId)

  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Could not load analysis results'))

  const results = data ?? []
  if (results.length === 0) return ok([])

  const { data: responses } = await supabase
    .from('responses')
    .select('id, text')
    .in('id', [...new Set(results.map((row) => String(row.response_id)))])

  const textById = new Map(
    (responses ?? []).map((row) => [String(row.id), String(row.text)]),
  )

  return ok(
    results.map((row) => ({
      responseId: String(row.response_id),
      responseText: textById.get(String(row.response_id)) ?? '',
      sentiment: row.sentiment as Sentiment,
      confidence: Number(row.sentiment_confidence),
      topics: (row.topics ?? []) as string[],
      keywords: (row.keywords ?? []) as string[],
      summary: row.summary ? String(row.summary) : null,
    })),
  )
}

/** Latest job for a dataset, so the detail page can link straight to it. */
export async function getLatestJobForDataset(
  datasetId: string,
): Promise<Result<AnalysisJob | null, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Could not load analysis job'))

  return ok(data ? toJob(data as JobRow) : null)
}
