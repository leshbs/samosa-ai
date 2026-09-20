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
}

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
    return err(appError(ERROR_CODES.INTERNAL, 'Could not count dataset responses'))
  }
  if (!count) {
    return err(appError(ERROR_CODES.VALIDATION, 'Dataset has no responses to analyze'))
  }

  const { data, error } = await supabase
    .from('analysis_jobs')
    .insert({
      organization_id: input.organizationId,
      dataset_id: input.datasetId,
      status: 'queued',
      prompt_version: input.promptVersion ?? DEFAULT_PROMPT_VERSION,
      total_count: count,
    })
    .select('id, status')
    .single()

  if (error || !data) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not create analysis job'))
  }

  return ok({ id: String(data.id), status: 'queued' })
}

/**
 * Executes a queued job end to end. Runs in a background worker (Inngest /
 * cron), not in a request handler — a 500-row dataset takes minutes.
 */
export async function runJob(
  jobId: string,
): Promise<Result<{ analyzed: number }, AppError>> {
  const supabase = createAdminClient()
  const log = logger.child({ jobId })

  const { data: job, error: jobError } = await supabase
    .from('analysis_jobs')
    .select('id, organization_id, dataset_id, prompt_version, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Analysis job not found'))
  }

  await supabase
    .from('analysis_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)

  const { data: responses, error: responsesError } = await supabase
    .from('responses')
    .select('id, text')
    .eq('dataset_id', job.dataset_id)

  if (responsesError || !responses) {
    await failJob(jobId, 'Could not load dataset responses')
    return err(appError(ERROR_CODES.INTERNAL, 'Could not load dataset responses'))
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
    await failJob(jobId, 'Could not persist analysis results')
    return err(appError(ERROR_CODES.INTERNAL, 'Could not persist analysis results'))
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
    skipped: outcome.value.skippedResponseIds.length,
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
