import { logger } from '@/modules/shared'
import type { AnalysisMode } from '@/types/domain'
import type { LlmAdapter } from '../adapters/types'
import { DEFAULT_MODE_VERSION, type ColumnDescription } from '../prompts'
import { asksForJudgement, guessModeByRule, modeSettledByShape } from './mode-rules'

/**
 * Guesses what each column of an uploaded sheet holds (pilot 01, §4.2;
 * ADR-0016). The upload wizard shows the guess and lets the uploader overrule
 * it, so a wrong guess costs a click — and a missing guess must never cost the
 * upload. Nothing here can fail: when the model does not answer, or not in
 * time, every column falls back to a rule.
 */

export type ModeGuess = {
  column: string
  mode: AnalysisMode
  /** `model` when the model said so, `rule` when a local rule decided. */
  source: 'model' | 'rule'
}

export type ModeDetection = {
  guesses: ModeGuess[]
  /** The prompt the model was asked with; null when it was never asked. */
  promptVersion: string | null
  modelId: string | null
}

/** The wizard is waiting on this; past it the rules answer instead. */
export const DETECTION_TIMEOUT_MS = 8_000

function timeout<T>(ms: number): Promise<T | null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}

export type DetectModesOptions = {
  promptVersion?: string
  timeoutMs?: number
}

export async function detectModes(
  adapter: LlmAdapter,
  columns: readonly ColumnDescription[],
  options: DetectModesOptions = {},
): Promise<ModeDetection> {
  const promptVersion = options.promptVersion ?? DEFAULT_MODE_VERSION
  const byRule = (column: ColumnDescription): ModeGuess => ({
    column: column.header,
    mode: guessModeByRule(column),
    source: 'rule',
  })

  // Only columns a rule cannot settle are described to the model.
  const asked = columns.filter((column) => modeSettledByShape(column) === null)
  if (asked.length === 0) {
    return { guesses: columns.map(byRule), promptVersion: null, modelId: null }
  }

  const reply = await Promise.race([
    adapter.classifyColumns({ columns: asked, promptVersion }),
    timeout<never>(options.timeoutMs ?? DETECTION_TIMEOUT_MS),
  ])

  if (reply === null || !reply.ok) {
    logger.warn('analysis.modes.fell_back', {
      columns: asked.length,
      reason: reply === null ? 'timeout' : reply.error.message,
    })
    return { guesses: columns.map(byRule), promptVersion: null, modelId: null }
  }

  const fromModel = new Map(
    asked.map((column, index) => [column, reply.value.modes[index] ?? null]),
  )

  logger.info('analysis.modes.detected', {
    promptVersion,
    modelId: reply.value.modelId,
    columns: asked.length,
    costMicroIdr: reply.value.costMicroIdr,
  })

  return {
    guesses: columns.map((column) => {
      const mode = fromModel.get(column)
      if (!mode) return byRule(column)
      // A header that names feedback outright is read for sentiment whatever
      // the model made of it: see `asksForJudgement`.
      if (mode === 'thematic' && asksForJudgement(column.header)) {
        return {
          column: column.header,
          mode: 'evaluative' as const,
          source: 'rule' as const,
        }
      }
      return { column: column.header, mode, source: 'model' as const }
    }),
    promptVersion,
    modelId: reply.value.modelId,
  }
}
