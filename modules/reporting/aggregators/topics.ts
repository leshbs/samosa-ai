import {
  countTerms,
  distributeTerms,
  type AnalyzedRecord,
  type CountedTerm,
  type TermDistribution,
} from './types'

export const DEFAULT_TOP_TOPICS = 10

export type TopicCount = CountedTerm

/** Top N topics by how many responses mention them. */
export function aggregateTopics(
  records: ReadonlyArray<Pick<AnalyzedRecord, 'topics'>>,
  limit: number = DEFAULT_TOP_TOPICS,
): TopicCount[] {
  return countTerms(
    records.map((record) => ({ terms: record.topics })),
    limit,
  )
}

/**
 * The same ranking, split at the cap instead of truncated.
 *
 * `analysis.v1` produces a long tail — 57 distinct topics from 120 responses in
 * the v1 eval — because normalization is lowercase-and-trim, so "kantin" and
 * "kantin sekolah" stay separate. Until that is fixed at the vocabulary level,
 * the honest thing is to show the top few and say out loud how much is left
 * over, rather than let a reader mistake eight bars for the whole dataset.
 */
export function distributeTopics(
  records: ReadonlyArray<Pick<AnalyzedRecord, 'topics'>>,
  limit: number = DEFAULT_TOP_TOPICS,
): TermDistribution {
  return distributeTerms(
    records.map((record) => ({ terms: record.topics })),
    limit,
  )
}
