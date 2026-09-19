import { sanitizeResponseText } from '../postprocess/sanitize'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalyzedItem, LlmAdapter } from '../adapters/types'

/** 30 fits comfortably in one request while keeping the 2-minute/500-row budget. */
export const BATCH_SIZE = 30
/** Batches run concurrently; 4 stays inside typical provider rate limits. */
export const MAX_CONCURRENCY = 4

export type OrchestratorInput = {
  jobId: string
  promptVersion: string
  responses: ReadonlyArray<{ id: string; text: string }>
}

export type AnalyzedResponse = AnalyzedItem & { responseId: string }

export type OrchestratorOutput = {
  results: AnalyzedResponse[]
  modelId: string
  totalInputTokens: number
  totalOutputTokens: number
  /** Responses whose batch failed; the caller decides whether to retry. */
  failedResponseIds: string[]
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
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
  const batches = chunk(input.responses, BATCH_SIZE)
  log.info('analysis.batches.created', { batches: batches.length })

  const results: AnalyzedResponse[] = []
  const failedResponseIds: string[] = []
  let modelId = adapter.name
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const batchOutcomes = await withConcurrency(
    batches,
    MAX_CONCURRENCY,
    async (batch, index) => {
      const sanitized = batch.map((response) => sanitizeResponseText(response.text))
      const flagged = sanitized.filter((entry) => entry.flagged).length
      if (flagged > 0) {
        log.warn('analysis.injection.flagged', { batch: index, flagged })
      }

      const outcome = await adapter.analyzeBatch({
        texts: sanitized.map((entry) => entry.text),
        promptVersion: input.promptVersion,
      })

      return { batch, outcome }
    },
  )

  for (const { batch, outcome } of batchOutcomes) {
    if (!outcome.ok) {
      log.error('analysis.batch.failed', { code: outcome.error.code })
      failedResponseIds.push(...batch.map((response) => response.id))
      continue
    }

    modelId = outcome.value.modelId
    totalInputTokens += outcome.value.usage.inputTokens
    totalOutputTokens += outcome.value.usage.outputTokens

    for (const item of outcome.value.items) {
      const response = batch[item.index]
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

  return ok({ results, modelId, totalInputTokens, totalOutputTokens, failedResponseIds })
}
