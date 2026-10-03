import type { QuestionMode } from '@/types/domain'
import { sanitizeResponseText } from '../postprocess/sanitize'
import type { PromptedMode } from '../prompts'
import { isNonAnswer } from './no-content'
import { scaleValue } from './scale'

/** 30 fits comfortably in one request while keeping the 2-minute/500-row budget. */
export const BATCH_SIZE = 30

/**
 * Tighter than the 4000-char storage limit: a single rambling response should
 * not crowd out the other 29 in its batch, and the tail of a long aspiration
 * rarely changes its sentiment.
 */
export const MAX_ANALYZED_LENGTH = 2_000

/**
 * Below this there is nothing to classify — punctuation or a stray keystroke.
 * Only where the answer is prose: "ya", "A" and "5" are whole answers to a
 * question that asks for a choice or a number.
 */
const MIN_ANALYZED_LENGTH = 3

export type Analyzable = {
  id: string
  text: string
  /** The question this answers. Answers to different questions never share a batch. */
  questionId?: string
}

export type PreparedBatch = {
  /** The one question every item answers; null when the caller named none. */
  questionId: string | null
  /** How that question is read, and so which prompt the batch is sent with. */
  mode: PromptedMode
  /** Batch-local order is meaningful: the model answers by index. */
  items: Array<{ id: string; text: string }>
}

/** An answer to a `scale` question, read here: it never reaches a model. */
export type ReadValue = { id: string; value: string }

export type BatchPlan = {
  batches: PreparedBatch[]
  /**
   * Responses that say nothing — empty, a stray keystroke, or a non-answer
   * like "tidak ada" — and are never sent to the model. They are not
   * aspirations, so they get no result and stay out of every percentage.
   */
  skippedIds: string[]
  truncatedIds: string[]
  flaggedIds: string[]
  /** Answers to `scale` questions with the value each gives. */
  values: ReadValue[]
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
 *
 * Batches are cut per question. "Apa yang perlu diperbaiki?" and "Apa yang
 * paling berkesan?" set different expectations for the same words, and a batch
 * is the unit a prompt speaks to: once prompts differ by question, a mixed
 * batch could not be given either one.
 *
 * `modeOf` says how each question is read (ADR-0016). It decides what counts
 * as a non-answer — "tidak" is one under "Ada saran?", and an answer under
 * "Apakah kamu ikut lagi?" — and it takes `scale` answers out of the batches
 * altogether: a number is read here, not by a model.
 */
export function planBatches(
  responses: ReadonlyArray<Analyzable>,
  batchSize: number = BATCH_SIZE,
  modeOf: (questionId: string | null) => QuestionMode = () => 'evaluative',
): BatchPlan {
  // Insertion order of a Map is first-seen order, so questions keep the order
  // their answers arrive in.
  const byQuestion = new Map<string | null, Array<{ id: string; text: string }>>()
  const skippedIds: string[] = []
  const truncatedIds: string[] = []
  const flaggedIds: string[] = []
  const values: ReadValue[] = []

  for (const response of responses) {
    const sanitized = sanitizeResponseText(response.text)
    const mode = modeOf(response.questionId ?? null)

    if (mode === 'scale') {
      const value = scaleValue(sanitized.text)
      if (value === null) skippedIds.push(response.id)
      else values.push({ id: response.id, value })
      continue
    }

    const prose = mode === 'evaluative' || mode === 'thematic'
    if (
      (prose && sanitized.text.length < MIN_ANALYZED_LENGTH) ||
      isNonAnswer(sanitized.text, mode)
    ) {
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

    const questionId = response.questionId ?? null
    const group = byQuestion.get(questionId) ?? []
    group.push({ id: response.id, text })
    byQuestion.set(questionId, group)
  }

  return {
    batches: [...byQuestion].flatMap(([questionId, items]) => {
      const mode = modeOf(questionId)
      return chunk(items, batchSize).map((batch) => ({
        questionId,
        // `scale` answers were taken out above, so this is only ever one of
        // the three prompted modes.
        mode: mode === 'scale' ? 'evaluative' : mode,
        items: batch,
      }))
    }),
    skippedIds,
    truncatedIds,
    flaggedIds,
    values,
  }
}
