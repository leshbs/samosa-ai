import type { Sentiment, TopicBreakdown } from '@/types/domain'

const EMPTY_SENTIMENT_COUNTS: Record<Sentiment, number> = {
  positive: 0,
  neutral: 0,
  negative: 0,
}

/** Lowercase + trim so "Konsumsi " and "konsumsi" do not become two topics. */
export function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A result with no sentiment — its question had none to find — is not counted. */
export function countSentiments(
  sentiments: ReadonlyArray<Sentiment | null>,
): Record<Sentiment, number> {
  return sentiments.reduce<Record<Sentiment, number>>(
    (counts, sentiment) =>
      sentiment === null ? counts : { ...counts, [sentiment]: counts[sentiment] + 1 },
    { ...EMPTY_SENTIMENT_COUNTS },
  )
}

export function buildTopicBreakdown(
  entries: ReadonlyArray<{ topics: readonly string[]; sentiment: Sentiment | null }>,
): TopicBreakdown[] {
  const byTopic = new Map<
    string,
    { count: number; sentiments: Array<Sentiment | null> }
  >()

  for (const entry of entries) {
    for (const rawTopic of entry.topics) {
      const topic = normalizeTopic(rawTopic)
      if (!topic) continue
      const bucket = byTopic.get(topic) ?? { count: 0, sentiments: [] }
      bucket.count += 1
      bucket.sentiments.push(entry.sentiment)
      byTopic.set(topic, bucket)
    }
  }

  const total = [...byTopic.values()].reduce((sum, bucket) => sum + bucket.count, 0)

  return [...byTopic.entries()]
    .map(([topic, bucket]) => ({
      topic,
      count: bucket.count,
      share: total === 0 ? 0 : bucket.count / total,
      sentimentCounts: countSentiments(bucket.sentiments),
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}
