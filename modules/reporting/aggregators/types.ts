import type { Sentiment } from '@/types/domain'

/**
 * The slice of an analysis result the chart aggregators need. Deliberately
 * narrower than `AnalysisResult`: aggregators are pure and must stay testable
 * with a three-field fixture rather than a full database row.
 */
export type AnalyzedRecord = {
  sentiment: Sentiment
  topics: readonly string[]
  keywords: readonly string[]
}

/** A labelled magnitude — what every bar chart here consumes. */
export type CountedTerm = {
  term: string
  count: number
  /** Share of all mentions, not of all responses: one response carries several terms. */
  share: number
}

/** Lowercase + collapse whitespace so "Kantin " and "kantin" are one term. */
export function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * A ranked set of terms split at the display cap, with nothing thrown away.
 *
 * The split is kept rather than sliced off because the two halves answer
 * different questions. A chart needs a readable handful; deciding whether the
 * model is fragmenting one idea into six near-synonyms needs the whole tail.
 * Returning only the top N meant the second question could not be asked at
 * all, and — worse — the chart silently implied the top N was the dataset.
 */
export type TermDistribution = {
  top: CountedTerm[]
  /** Everything ranked below the cap, in the same order. */
  tail: CountedTerm[]
  /** Distinct terms before the cap was applied. */
  distinctCount: number
}

/** Sums a tail into the single bucket a chart can draw next to the top terms. */
export function summarizeTail(tail: readonly CountedTerm[]): CountedTerm | null {
  if (tail.length === 0) return null

  return {
    term: 'Lainnya',
    count: tail.reduce((sum, item) => sum + item.count, 0),
    share: tail.reduce((sum, item) => sum + item.share, 0),
  }
}

/**
 * Counts terms across records and splits them at `limit`, sorted by frequency
 * then alphabetically so the order is stable across renders — a bar chart that
 * reshuffles ties on every refresh looks like the data changed when it did not.
 */
export function distributeTerms(
  records: ReadonlyArray<{ terms: readonly string[] }>,
  limit: number,
): TermDistribution {
  const counts = new Map<string, number>()

  for (const record of records) {
    // One mention per term per response: a rant that says "kantin" six times
    // is still one response complaining about the canteen.
    const seen = new Set<string>()
    for (const raw of record.terms) {
      const term = normalizeTerm(raw)
      if (!term || seen.has(term)) continue
      seen.add(term)
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)

  const ranked = [...counts.entries()]
    .map(([term, count]) => ({
      term,
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))

  return {
    top: ranked.slice(0, limit),
    tail: ranked.slice(limit),
    distinctCount: ranked.length,
  }
}

/** The ranked head only, for callers that have no room for a tail. */
export function countTerms(
  records: ReadonlyArray<{ terms: readonly string[] }>,
  limit: number,
): CountedTerm[] {
  return distributeTerms(records, limit).top
}
