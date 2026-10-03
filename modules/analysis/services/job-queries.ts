import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  REPORTABLE_STATUSES,
  type AnalysisJob,
  type JobStatus,
  type Sentiment,
} from '@/types/domain'

/**
 * Reads go through the request-scoped client, so RLS keeps other tenants out.
 * RLS is not enough on its own, though: it admits every workspace the caller
 * belongs to, and a person can be in two (ADR-0012). So each read also takes
 * the active workspace's id and filters on it — including the lookups by id,
 * because the caller's role was resolved for that workspace and no other.
 */

/**
 * `*` rather than a column list, because every page that lists jobs goes
 * through here: naming `created_by` would break /analysis, /reports and the
 * dashboard on a database that has not had the settings migration yet. toJob
 * picks out what it needs and tolerates what is missing.
 */
const JOB_COLUMNS = '*'

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
    noContentCount: Number(row.no_content_count ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costMicroIdr: Number(row.cost_micro_idr ?? 0),
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
  }
}

export type JobListItem = AnalysisJob & { datasetName: string }

export type ListJobsOptions = {
  /** Only jobs this user started — the profile's "my recent activity". */
  createdBy?: string
  limit?: number
  /**
   * Reports follow their dataset into the archive (ADR-0012) and are hidden
   * from every page. The export is the one caller that still wants them.
   */
  includeArchived?: boolean
}

const DEFAULT_JOB_LIMIT = 50

export async function listJobs(
  organizationId: string,
  options: ListJobsOptions = {},
): Promise<Result<JobListItem[], AppError>> {
  const supabase = await createClient()

  let query = supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? DEFAULT_JOB_LIMIT)
  if (options.createdBy) query = query.eq('created_by', options.createdBy)
  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query

  if (error)
    return err(appError(ERROR_CODES.INTERNAL, 'Daftar analisis tidak bisa dimuat'))

  const jobs = (data ?? []).map((row) => toJob(row as JobRow))
  if (jobs.length === 0) return ok([])

  // Separate lookup rather than a nested select: types/database.ts is
  // hand-written and declares no relationships for the client to infer.
  const { data: datasets } = await supabase
    .from('datasets')
    .select('id, name')
    .eq('organization_id', organizationId)
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

export async function getJob(
  organizationId: string,
  jobId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Result<AnalysisJob, AppError>> {
  const supabase = await createClient()

  let query = supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .eq('organization_id', organizationId)
  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query.maybeSingle()

  // Another tenant's job (RLS) and a job in the caller's other workspace (the
  // filter) both come back as "no rows", which is what we want.
  if (error || !data)
    return err(appError(ERROR_CODES.NOT_FOUND, 'Job analisis tidak ditemukan'))

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
  organizationId: string,
  jobId: string,
): Promise<Result<AnalysisResultRow[], AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_results')
    .select('response_id, sentiment, sentiment_confidence, topics, keywords, summary')
    .eq('job_id', jobId)
    .eq('organization_id', organizationId)

  if (error)
    return err(appError(ERROR_CODES.INTERNAL, 'Hasil analisis tidak bisa dimuat'))

  const results = data ?? []
  if (results.length === 0) return ok([])

  const { data: responses } = await supabase
    .from('responses')
    .select('id, text')
    .eq('organization_id', organizationId)
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
  organizationId: string,
  datasetId: string,
): Promise<Result<AnalysisJob | null, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('dataset_id', datasetId)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Analisis tidak bisa dimuat'))

  return ok(data ? toJob(data as JobRow) : null)
}

export type UsageSummary = {
  totalJobs: number
  responsesAnalyzed: number
  inputTokens: number
  outputTokens: number
  costMicroIdr: number
}

/**
 * What this organization has spent so far. Summed in JS rather than with a
 * Postgres aggregate: a school's job count is in the dozens, and an rpc() would
 * mean a migration to maintain for arithmetic this small.
 */
export async function getUsageSummary(
  organizationId: string,
): Promise<Result<UsageSummary, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('processed_count, input_tokens, output_tokens, cost_micro_idr')
    .eq('organization_id', organizationId)

  if (error)
    return err(appError(ERROR_CODES.INTERNAL, 'Data pemakaian tidak bisa dimuat'))

  const rows = data ?? []

  return ok({
    totalJobs: rows.length,
    responsesAnalyzed: rows.reduce((sum, row) => sum + Number(row.processed_count), 0),
    inputTokens: rows.reduce((sum, row) => sum + Number(row.input_tokens), 0),
    outputTokens: rows.reduce((sum, row) => sum + Number(row.output_tokens), 0),
    costMicroIdr: rows.reduce((sum, row) => sum + Number(row.cost_micro_idr), 0),
  })
}

/**
 * How many finished jobs have a report to open — the badge on the sidebar's
 * "Laporan" entry. A HEAD count, so it costs one indexed scan and no rows.
 */
export async function countReports(
  organizationId: string,
): Promise<Result<number, AppError>> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('analysis_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .in('status', [...REPORTABLE_STATUSES])

  if (error || count === null)
    return err(appError(ERROR_CODES.INTERNAL, 'Jumlah laporan tidak bisa dimuat'))

  return ok(count)
}

/**
 * Upper bound on jobs counted in one call. Each job is its own HEAD request,
 * and the home page — the only caller — shows six at most.
 */
export const MAX_COUNTED_JOBS = 6

/**
 * Results carrying one sentiment, per job, without fetching the rows.
 *
 * The home page needs a positive share for a handful of reports. Selecting the
 * `sentiment` column would transfer every row — and PostgREST caps a response
 * at 1,000 rows, so a 5,000-response job would be silently undercounted. A
 * HEAD count per job is exact and transfers nothing. There is no stored
 * per-job tally to read instead: an RPC would mean a migration for arithmetic
 * this small (see getUsageSummary).
 *
 * The denominator is the job's `processedCount`, which the runner sets to the
 * number of result rows it stored, so callers need only the numerator.
 */
export async function countResultsBySentiment(
  organizationId: string,
  jobIds: readonly string[],
  sentiment: Sentiment,
): Promise<Result<Record<string, number>, AppError>> {
  const ids = [...new Set(jobIds)].slice(0, MAX_COUNTED_JOBS)
  if (ids.length === 0) return ok({})

  const supabase = await createClient()

  const counts = await Promise.all(
    ids.map(async (jobId) => {
      const { count, error } = await supabase
        .from('analysis_results')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('organization_id', organizationId)
        .eq('sentiment', sentiment)

      return error || count === null ? null : ([jobId, count] as const)
    }),
  )

  const complete = counts.filter((entry) => entry !== null)
  // All or nothing: a share computed for four of six reports would put a
  // plausible-looking wrong average on the home page.
  if (complete.length !== ids.length)
    return err(appError(ERROR_CODES.INTERNAL, 'Sebaran sentimen tidak bisa dimuat'))

  return ok(Object.fromEntries(complete))
}

export type JobSnapshot = {
  jobId: string
  organizationId: string
  organizationName: string
  /** Raw column value; the caller validates it against the known zones. */
  organizationTimezone: unknown
  datasetId: string
  datasetName: string
  status: JobStatus
  processedCount: number
  totalCount: number
  failedCount: number
  createdBy: string | null
  finishedAt: string | null
}

/**
 * A finished job as the notification after it needs to describe it. Service
 * role: this runs in the background after the request that started the job
 * has returned, so there is no session to read it with. The id comes from the
 * runner, never from a request.
 */
export async function getJobSnapshot(jobId: string): Promise<JobSnapshot | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('analysis_jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle()
  if (!data) return null

  const job = toJob(data as JobRow)
  const [{ data: dataset }, { data: organization }] = await Promise.all([
    supabase.from('datasets').select('name').eq('id', job.datasetId).maybeSingle(),
    supabase.from('organizations').select('*').eq('id', job.organizationId).maybeSingle(),
  ])

  return {
    jobId: job.id,
    organizationId: job.organizationId,
    organizationName: organization?.name ?? 'Organisasi',
    organizationTimezone: (organization as Record<string, unknown> | null)?.timezone,
    datasetId: job.datasetId,
    datasetName: dataset?.name ?? 'Dataset',
    status: job.status,
    processedCount: job.processedCount,
    totalCount: job.totalCount,
    failedCount: job.failedCount,
    createdBy: job.createdBy,
    finishedAt: job.finishedAt,
  }
}
