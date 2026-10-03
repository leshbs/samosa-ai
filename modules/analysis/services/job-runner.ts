import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createOpenAiAdapter } from '../adapters/openai'
import { DEFAULT_PROMPT_VERSION } from '../prompts'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalysisJob } from '@/types/domain'
import { analyzeResponses } from './orchestrator'

export type CreateJobInput = {
  organizationId: string
  datasetId: string
  promptVersion?: string
  /** The user who started it: provenance, "my activity", and who to email. */
  createdBy?: string
}

/** PostgREST's answer to a column the schema cache has never heard of. */
const UNKNOWN_COLUMN = 'PGRST204'

/** Queues a job. The worker picks it up; the request returns immediately. */
export async function createJob(
  input: CreateJobInput,
): Promise<Result<Pick<AnalysisJob, 'id' | 'status'>, AppError>> {
  const supabase = createAdminClient()

  const { count, error: countError } = await supabase
    .from('responses')
    .select('id', { count: 'exact', head: true })
    .eq('dataset_id', input.datasetId)
    .eq('organization_id', input.organizationId)

  if (countError) {
    return err(
      appError(ERROR_CODES.INTERNAL, 'Jumlah aspirasi di dataset tidak bisa dihitung'),
    )
  }
  if (!count) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Dataset ini tidak punya aspirasi untuk dianalisis',
      ),
    )
  }

  const row = {
    organization_id: input.organizationId,
    dataset_id: input.datasetId,
    status: 'queued' as const,
    prompt_version: input.promptVersion ?? DEFAULT_PROMPT_VERSION,
    total_count: count,
    ...(input.createdBy ? { created_by: input.createdBy } : {}),
  }

  let { data, error } = await supabase
    .from('analysis_jobs')
    .insert(row)
    .select('id, status')
    .single()

  /**
   * `created_by` arrives with the settings migration. Until it has been run,
   * the insert is refused for naming it — and refusing to start any analysis
   * over a provenance column would be the wrong trade. Retry without it and
   * say so in the logs; the job simply has no recorded author.
   */
  if (error?.code === UNKNOWN_COLUMN && 'created_by' in row) {
    logger.warn('analysis.job.created_by_unavailable')
    const { created_by: _dropped, ...withoutAuthor } = row
    ;({ data, error } = await supabase
      .from('analysis_jobs')
      .insert(withoutAuthor)
      .select('id, status')
      .single())
  }

  if (error || !data) {
    return err(appError(ERROR_CODES.INTERNAL, 'Job analisis tidak bisa dibuat'))
  }

  return ok({ id: String(data.id), status: 'queued' })
}

export type RunJobOptions = {
  /**
   * Runs once the results are stored but before the job reaches a terminal
   * status. The report summary is written here: the page listens for that
   * status change, so anything that happens afterwards arrives too late and
   * the reader sees a finished report with an empty summary.
   *
   * It is a hook rather than a direct call because reporting depends on
   * analysis; calling reporting from here would close the cycle. The app layer
   * composes the two.
   */
  onResultsReady?: (context: { organizationId: string }) => Promise<void>
}

/**
 * Executes a queued job end to end. Runs in a background worker (Inngest /
 * cron), not in a request handler — a 500-row dataset takes minutes.
 */
export async function runJob(
  jobId: string,
  options: RunJobOptions = {},
): Promise<Result<{ analyzed: number }, AppError>> {
  const supabase = createAdminClient()
  const log = logger.child({ jobId })

  /**
   * Claims the job by compare-and-swap: the status moves to `running` only if
   * it is still `queued`, and the same statement tells us whether we won.
   *
   * A read-then-write would not do. Two invocations of the same job — a retried
   * webhook arriving while `after()` is still working, say — would both read
   * `queued`, both proceed, and the second would collide with
   * `unique (job_id, response_id)` when the results land. That insert failure
   * then calls `failJob`, so a job that was about to succeed ends up marked
   * failed. One statement makes exactly one caller the runner.
   *
   * Only `queued` is runnable, which also covers the terminal states: a job
   * that already succeeded, failed or was cancelled is never re-run in place.
   * Retrying is a new job row, so the failed attempt stays on the record.
   */
  const { data: claimed, error: claimError } = await supabase
    .from('analysis_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id, organization_id, dataset_id, prompt_version')

  if (claimError) {
    return err(appError(ERROR_CODES.INTERNAL, 'Job analisis tidak bisa dimulai'))
  }

  const job = claimed?.[0]
  if (!job) {
    // Nothing was claimed. Read the row back only to say which of the two
    // reasons it was — neither is recoverable by running the job anyway.
    const { data: existing } = await supabase
      .from('analysis_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle()

    if (!existing) {
      return err(appError(ERROR_CODES.NOT_FOUND, 'Job analisis tidak ditemukan'))
    }

    log.warn('analysis.job.already_claimed', { status: String(existing.status) })
    return err(appError(ERROR_CODES.CONFLICT, 'Job analisis ini sudah pernah dijalankan'))
  }

  const { data: responses, error: responsesError } = await supabase
    .from('responses')
    .select('id, text')
    .eq('dataset_id', job.dataset_id)

  if (responsesError || !responses) {
    await failJob(jobId, 'Aspirasi di dataset tidak bisa dimuat')
    return err(appError(ERROR_CODES.INTERNAL, 'Aspirasi di dataset tidak bisa dimuat'))
  }

  const outcome = await analyzeResponses(createOpenAiAdapter(), {
    jobId,
    promptVersion: String(job.prompt_version),
    responses: responses.map((row) => ({ id: String(row.id), text: String(row.text) })),
    // Persist progress as batches land so the polling endpoint has something
    // to report; a 500-row job otherwise sits at 0 for minutes.
    onProgress: async ({ processed, total }) => {
      await supabase
        .from('analysis_jobs')
        .update({ processed_count: processed, total_count: total })
        .eq('id', jobId)
    },
  })

  if (!outcome.ok) {
    await failJob(jobId, outcome.error.message)
    return outcome
  }

  const rows = outcome.value.results.map((result) => ({
    organization_id: job.organization_id,
    job_id: jobId,
    response_id: result.responseId,
    sentiment: result.sentiment,
    sentiment_confidence: result.confidence,
    topics: result.topics,
    keywords: result.keywords,
    summary: result.summary,
    prompt_version: String(job.prompt_version),
    model_id: outcome.value.modelId,
  }))

  const { error: insertError } = await supabase.from('analysis_results').insert(rows)
  if (insertError) {
    await failJob(jobId, 'Hasil analisis tidak bisa disimpan')
    return err(appError(ERROR_CODES.INTERNAL, 'Hasil analisis tidak bisa disimpan'))
  }

  if (options.onResultsReady) {
    try {
      await options.onResultsReady({ organizationId: String(job.organization_id) })
    } catch (cause) {
      // A missing narrative is a worse report, not a failed analysis: the
      // results are already saved and the charts render without it.
      log.warn('analysis.job.after_results_failed', { cause: String(cause) })
    }
  }

  // Some batches failed but we kept what landed: saying "succeeded" would
  // overstate the result, and "failed" would throw away usable analysis.
  const failedCount = outcome.value.failedResponseIds.length
  const status = failedCount > 0 ? 'partial' : 'succeeded'

  await supabase
    .from('analysis_jobs')
    .update({
      status,
      processed_count: rows.length,
      failed_count: failedCount,
      no_content_count: outcome.value.noContentResponseIds.length,
      input_tokens: outcome.value.totalInputTokens,
      output_tokens: outcome.value.totalOutputTokens,
      cost_micro_idr: outcome.value.costMicroIdr,
      model_id: outcome.value.modelId,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  log.info('analysis.job.finished', {
    status,
    analyzed: rows.length,
    failed: failedCount,
    noContent: outcome.value.noContentResponseIds.length,
    inputTokens: outcome.value.totalInputTokens,
    outputTokens: outcome.value.totalOutputTokens,
    costMicroIdr: outcome.value.costMicroIdr,
  })

  return ok({ analyzed: rows.length })
}

async function failJob(jobId: string, message: string): Promise<void> {
  await createAdminClient()
    .from('analysis_jobs')
    .update({
      status: 'failed',
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
