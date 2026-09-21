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
 * Counts terms across records, sorted by frequency then alphabetically so the
 * order is stable across renders — a bar chart that reshuffles ties on every
 * refresh looks like the data changed when it did not.
 */
export function countTerms(
  records: ReadonlyArray<{ terms: readonly string[] }>,
  limit: number,
): CountedTerm[] {
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

  return [...counts.entries()]
    .map(([term, count]) => ({
      term,
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
}
