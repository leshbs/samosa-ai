import { countTerms, type AnalyzedRecord, type CountedTerm } from './types'

export const DEFAULT_TOP_KEYWORDS = 20

export type KeywordCount = CountedTerm

/**
 * Top N keywords by frequency. Rendered as a bar chart rather than a word
 * cloud: a cloud encodes magnitude in glyph area, which nobody can compare by
 * eye, and it cannot be read by a screen reader at all.
 */
export function aggregateKeywords(
  records: ReadonlyArray<Pick<AnalyzedRecord, 'keywords'>>,
  limit: number = DEFAULT_TOP_KEYWORDS,
): KeywordCount[] {
  return countTerms(
    records.map((record) => ({ terms: record.keywords })),
    limit,
  )
}
