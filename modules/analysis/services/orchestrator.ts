import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalyzedItem, LlmAdapter } from '../adapters/types'
import { BATCH_SIZE, chunk, planBatches } from './batcher'

export { BATCH_SIZE, chunk }

/** Batches run concurrently; 4 stays inside typical provider rate limits. */
export const MAX_CONCURRENCY = 4

export type OrchestratorInput = {
  jobId: string
  promptVersion: string
  responses: ReadonlyArray<{ id: string; text: string }>
  /**
   * Called as each batch lands, so a long job can show progress. Fired from the
   * batch loop, so it must not throw — failures are logged and swallowed.
   */
  onProgress?: (progress: { processed: number; total: number }) => Promise<void> | void
}

export type AnalyzedResponse = AnalyzedItem & { responseId: string }

export type OrchestratorOutput = {
  results: AnalyzedResponse[]
  modelId: string
  totalInputTokens: number
  totalOutputTokens: number
  costMicroIdr: number
  /** Responses whose batch failed; the caller decides whether to retry. */
  failedResponseIds: string[]
  /** Responses never sent to the model because they were empty after cleaning. */
  skippedResponseIds: string[]
}

/** Runs tasks with a bounded number in flight, preserving result order. */
async function withConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index]
      if (item === undefined) continue
      results[index] = await task(item, index)
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Fans a dataset out across batched LLM calls and stitches the results back to
 * their response ids. A failed batch degrades that batch only — a 500-row job
 * should not be lost because one request timed out.
 */
export async function analyzeResponses(
  adapter: LlmAdapter,
  input: OrchestratorInput,
): Promise<Result<OrchestratorOutput, AppError>> {
  if (input.responses.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'Dataset has no responses to analyze'))
  }

  const log = logger.child({ jobId: input.jobId, adapter: adapter.name })
  const plan = planBatches(input.responses)

  if (plan.batches.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'No responses survived cleaning'))
  }

  log.info('analysis.batches.created', {
    batches: plan.batches.length,
    skipped: plan.skippedIds.length,
    truncated: plan.truncatedIds.length,
    flagged: plan.flaggedIds.length,
  })

  const analyzableCount = plan.batches.reduce((sum, batch) => sum + batch.items.length, 0)
  let processed = 0

  const batchOutcomes = await withConcurrency(
    plan.batches,
    MAX_CONCURRENCY,
    async (batch, index) => {
      const outcome = await adapter.analyzeBatch({
        texts: batch.items.map((item) => item.text),
        promptVersion: input.promptVersion,
      })

      // Progress counts attempted work, so a failing batch still advances the
      // bar rather than leaving the user watching a stalled job.
      processed += batch.items.length
      if (input.onProgress) {
        try {
          await input.onProgress({ processed, total: analyzableCount })
        } catch (cause) {
          log.warn('analysis.progress.failed', { batch: index, cause: String(cause) })
        }
      }

      return { batch, outcome }
    },
  )

  const results: AnalyzedResponse[] = []
  const failedResponseIds: string[] = []
  let modelId = adapter.name
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let costMicroIdr = 0

  for (const { batch, outcome } of batchOutcomes) {
    if (!outcome.ok) {
      log.error('analysis.batch.failed', { code: outcome.error.code })
      failedResponseIds.push(...batch.items.map((item) => item.id))
      continue
    }

    modelId = outcome.value.modelId
    totalInputTokens += outcome.value.usage.inputTokens
    totalOutputTokens += outcome.value.usage.outputTokens
    costMicroIdr += outcome.value.costMicroIdr

    for (const item of outcome.value.items) {
      const response = batch.items[item.index]
      if (!response) {
        log.warn('analysis.item.orphaned', { index: item.index })
        continue
      }
      results.push({ ...item, responseId: response.id })
    }
  }

  if (results.length === 0) {
    return err(appError(ERROR_CODES.UPSTREAM, 'Every analysis batch failed'))
  }

  return ok({
    results,
    modelId,
    totalInputTokens,
    totalOutputTokens,
    costMicroIdr,
    failedResponseIds,
    skippedResponseIds: plan.skippedIds,
  })
}
