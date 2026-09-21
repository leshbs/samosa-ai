import { SENTIMENTS, type Sentiment } from '@/types/domain'
import { aggregateTopics, DEFAULT_TOP_TOPICS } from './topics'
import { normalizeTerm, type AnalyzedRecord } from './types'

export type TopicSentimentRow = {
  topic: string
  total: number
  counts: Record<Sentiment, number>
  shares: Record<Sentiment, number>
}

const EMPTY: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 }

/**
 * Sentiment broken down per topic — the one view that answers "which topic is
 * the problem", as opposed to "which topic is loud". Rows follow the same
 * ranking as the topic chart so the two read as one story.
 */
export function crossTabTopicSentiment(
  records: ReadonlyArray<Pick<AnalyzedRecord, 'topics' | 'sentiment'>>,
  limit: number = DEFAULT_TOP_TOPICS,
): TopicSentimentRow[] {
  const ranked = aggregateTopics(records, limit)
  const byTopic = new Map<string, Record<Sentiment, number>>(
    ranked.map((entry) => [entry.term, { ...EMPTY }]),
  )

  for (const record of records) {
    // Same de-duplication as the topic count, or a response tagged
    // ["kantin", "Kantin"] would weigh twice in its own row.
    const seen = new Set<string>()
    for (const raw of record.topics) {
      const topic = normalizeTerm(raw)
      const counts = byTopic.get(topic)
      if (!counts || seen.has(topic)) continue
      seen.add(topic)
      counts[record.sentiment] += 1
    }
  }

  return ranked.map((entry) => {
    const counts = byTopic.get(entry.term) ?? { ...EMPTY }
    const shares = { ...EMPTY }
    for (const sentiment of SENTIMENTS) {
      shares[sentiment] = entry.count === 0 ? 0 : counts[sentiment] / entry.count
    }
    return { topic: entry.term, total: entry.count, counts, shares }
  })
}
