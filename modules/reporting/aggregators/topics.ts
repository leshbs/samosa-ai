import { countTerms, type AnalyzedRecord, type CountedTerm } from './types'

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
