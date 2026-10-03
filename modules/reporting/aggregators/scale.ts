import { normalizeTerm, type CountedTerm } from './types'

/** Bars a distribution can hold before it stops being read at a glance. */
export const DEFAULT_SCALE_VALUES = 12

/**
 * A `scale` question as a report draws it (pilot 01, §4.1): how many gave each
 * value, the mean of the answers that are numbers, and the value given most.
 */
export type ScaleSummary = {
  /**
   * The most common values, numbers first in ascending order, then worded
   * answers by count. `share` is of all answers, not of mentions: one answer
   * gives one value.
   */
  values: CountedTerm[]
  /** Answers whose value did not make the list. */
  otherCount: number
  answers: number
  /** Answers that are numbers; the mean is over these alone. */
  numericAnswers: number
  /** Null when no answer is a number: "sangat setuju" has no average. */
  mean: number | null
  /** The value given most; several, when they tie. Null when there are none. */
  mostCommon: string | null
  mostCommonCount: number
}

const NUMERIC = /^\d+(?:\.\d+)?$/

function numberOf(value: string): number | null {
  return NUMERIC.test(value) ? Number.parseFloat(value) : null
}

/** A tie past this is not a mode worth naming. */
const MAX_TIED_MODES = 3

/**
 * Each row's first "topic" is the value its answer gave — written there by the
 * analysis job, which reads a scale answer without a model.
 */
export function aggregateScale(
  records: ReadonlyArray<{ topics: readonly string[] }>,
  limit: number = DEFAULT_SCALE_VALUES,
): ScaleSummary {
  const counts = new Map<string, number>()
  let answers = 0
  let numericAnswers = 0
  let sum = 0

  for (const record of records) {
    const value = normalizeTerm(record.topics[0] ?? '')
    if (!value) continue
    answers += 1
    counts.set(value, (counts.get(value) ?? 0) + 1)

    const number = numberOf(value)
    if (number !== null) {
      numericAnswers += 1
      sum += number
    }
  }

  const ranked = [...counts.entries()]
    .map(([term, count]) => ({ term, count, share: answers === 0 ? 0 : count / answers }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))

  const kept = ranked.slice(0, limit)
  const top = ranked[0]?.count ?? 0
  const tied = ranked.filter((entry) => entry.count === top)

  return {
    values: [...kept].sort((a, b) => {
      const left = numberOf(a.term)
      const right = numberOf(b.term)
      if (left !== null && right !== null) return left - right
      if (left !== null) return -1
      if (right !== null) return 1
      return b.count - a.count || a.term.localeCompare(b.term)
    }),
    otherCount: ranked.slice(limit).reduce((total, entry) => total + entry.count, 0),
    answers,
    numericAnswers,
    mean: numericAnswers === 0 ? null : sum / numericAnswers,
    mostCommon:
      tied.length === 0 || tied.length > MAX_TIED_MODES
        ? null
        : tied.map((entry) => entry.term).join(', '),
    mostCommonCount: top,
  }
}
