import { sanitizeResponseText } from '../postprocess/sanitize'

/** 30 fits comfortably in one request while keeping the 2-minute/500-row budget. */
export const BATCH_SIZE = 30

/**
 * Tighter than the 4000-char storage limit: a single rambling response should
 * not crowd out the other 29 in its batch, and the tail of a long aspiration
 * rarely changes its sentiment.
 */
export const MAX_ANALYZED_LENGTH = 2_000

/** Below this there is nothing to classify — punctuation or a stray keystroke. */
const MIN_ANALYZED_LENGTH = 3

export type Analyzable = { id: string; text: string }

export type PreparedBatch = {
  /** Batch-local order is meaningful: the model answers by index. */
  items: Array<{ id: string; text: string }>
}

export type BatchPlan = {
  batches: PreparedBatch[]
  /** Responses dropped before any model call, with the reason. */
  skippedIds: string[]
  truncatedIds: string[]
  flaggedIds: string[]
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Turns raw responses into model-ready batches.
 *
 * Sanitizing here rather than inside the adapter means every adapter gets the
 * same guarantees, and the caller learns what was dropped — a job that silently
 * analyzed 400 of 500 responses would be a reporting bug waiting to happen.
 */
export function planBatches(
  responses: ReadonlyArray<Analyzable>,
  batchSize: number = BATCH_SIZE,
): BatchPlan {
  const analyzable: Array<{ id: string; text: string }> = []
  const skippedIds: string[] = []
  const truncatedIds: string[] = []
  const flaggedIds: string[] = []

  for (const response of responses) {
    const sanitized = sanitizeResponseText(response.text)

    if (sanitized.text.length < MIN_ANALYZED_LENGTH) {
      skippedIds.push(response.id)
      continue
    }

    if (sanitized.flagged) flaggedIds.push(response.id)

    const text =
      sanitized.text.length > MAX_ANALYZED_LENGTH
        ? sanitized.text.slice(0, MAX_ANALYZED_LENGTH)
        : sanitized.text

    if (text.length < sanitized.text.length || sanitized.truncated) {
      truncatedIds.push(response.id)
    }

    analyzable.push({ id: response.id, text })
  }

  return {
    batches: chunk(analyzable, batchSize).map((items) => ({ items })),
    skippedIds,
    truncatedIds,
    flaggedIds,
  }
}
