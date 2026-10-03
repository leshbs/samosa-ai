import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { readAll } from '@/lib/supabase/read-all'
import { createOpenAiAdapter } from '../adapters/openai'
import { DEFAULT_PROMPT_VERSION, effectiveMode } from '../prompts'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  isQuestionMode,
  type AnalysisJob,
  type QuestionCounts,
  type QuestionMode,
} from '@/types/domain'
import { analyzeResponses } from './orchestrator'
import { toStoredQuestionCounts } from './question-counts'

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

  // Paged: one select returns 1,000 rows at most, and a job that read only
  // those would analyse a fifth of a 5,000-answer dataset and call it done.
  const { data: responses, error: responsesError } = await readAll<{
    id: string
    text: string
    question_id: string
  }>((from, to) =>
    supabase
      .from('responses')
      .select('id, text, question_id')
      .eq('dataset_id', job.dataset_id)
      .order('respondent_index', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )

  if (responsesError) {
    await failJob(jobId, 'Aspirasi di dataset tidak bisa dimuat')
    return err(appError(ERROR_CODES.INTERNAL, 'Aspirasi di dataset tidak bisa dimuat'))
  }

  // What each question asked and how it is read. A dataset has ten questions
  // at most, so this one is not paged.
  const { data: questionRows, error: questionsError } = await supabase
    .from('dataset_questions')
    .select('id, question_text, analysis_mode')
    .eq('dataset_id', job.dataset_id)

  if (questionsError) {
    await failJob(jobId, 'Pertanyaan dataset tidak bisa dimuat')
    return err(appError(ERROR_CODES.INTERNAL, 'Pertanyaan dataset tidak bisa dimuat'))
  }

  const promptVersion = String(job.prompt_version)
  /**
   * The mode this job reads each question with: the one stored on the
   * question, unless the prompt version predates modes. Then everything is
   * `evaluative`, which is what makes re-running a dataset on analysis.v2 a
   * comparison rather than an error. A `segment` or `ignore` mode cannot be on
   * a question that has answers; if one ever is, it is read as `evaluative`
   * rather than dropped.
   */
  const questions: Record<string, { text: string; mode: QuestionMode }> = {}
  for (const row of questionRows ?? []) {
    const stored = isQuestionMode(row.analysis_mode) ? row.analysis_mode : 'evaluative'
    questions[String(row.id)] = {
      text: String(row.question_text),
      mode: effectiveMode(promptVersion, stored),
    }
  }

  const outcome = await analyzeResponses(createOpenAiAdapter(), {
    jobId,
    promptVersion,
    questions,
    responses: responses.map((row) => ({
      id: String(row.id),
      text: String(row.text),
      questionId: String(row.question_id),
    })),
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
    // Only prose is summarised; a choice or a number has nothing to shorten.
    summary: result.summary || null,
    prompt_version: promptVersion,
    model_id: outcome.value.modelId,
  }))

  const { error: insertError } = await supabase.from('analysis_results').insert(rows)
  if (insertError) {
    await failJob(jobId, 'Hasil analisis tidak bisa disimpan')
    return err(appError(ERROR_CODES.INTERNAL, 'Hasil analisis tidak bisa disimpan'))
  }

  // The same three counters the job carries, split by question: a report
  // section says "127 dari 181" about its own question, not about the survey.
  const questionOf = new Map(
    responses.map((row) => [String(row.id), String(row.question_id)]),
  )
  const questionCounts: Record<string, QuestionCounts> = {}
  const count = (responseId: string, field: 'analyzed' | 'noContent' | 'failed') => {
    const questionId = questionOf.get(responseId)
    if (!questionId) return
    const counts = (questionCounts[questionId] ??= {
      analyzed: 0,
      noContent: 0,
      failed: 0,
      mode: questions[questionId]?.mode ?? null,
    })
    counts[field] += 1
  }
  for (const result of outcome.value.results) count(result.responseId, 'analyzed')
  for (const id of outcome.value.noContentResponseIds) count(id, 'noContent')
  for (const id of outcome.value.failedResponseIds) count(id, 'failed')

  /**
   * Recorded before the hook below, not with the final status. The summary is
   * written inside that hook and needs to know how each question was read: a
   * summary written first took every question for `evaluative`, offered the
   * model a sentiment split of zeros for a question about numbers, and quoted
   * "4" as evidence (found reading a real report).
   */
  await supabase
    .from('analysis_jobs')
    .update({
      no_content_count: outcome.value.noContentResponseIds.length,
      question_counts: toStoredQuestionCounts(questionCounts),
    })
    .eq('id', jobId)

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
      question_counts: toStoredQuestionCounts(questionCounts),
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
    questions: Object.keys(questionCounts).length,
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
