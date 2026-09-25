import { SENTIMENTS, type Sentiment } from '@/types/domain'
import { aggregateTopics, distributeTopics, DEFAULT_TOP_TOPICS } from './topics'
import { normalizeTerm, type AnalyzedRecord } from './types'

/** Label for the collapsed tail. Matches `summarizeTail` so the two agree. */
export const OTHER_TOPIC_LABEL = 'Lainnya'

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

export type TopicSentimentBreakdown = {
  rows: TopicSentimentRow[]
  /**
   * Every topic below the cap, summed into one row. Null when nothing was cut.
   *
   * `total` counts mentions, not responses: a response tagged with two tail
   * topics contributes to both, exactly as it would if those topics had their
   * own bars. The bucket therefore lines up with the bars beside it rather
   * than with the response count, which is the same convention `share` uses
   * everywhere else in this module.
   */
  other: TopicSentimentRow | null
  /** Distinct topics before the cap — what the bucket label quotes. */
  distinctCount: number
}

/**
 * The chart's rows plus an explicit bucket for everything that did not fit.
 *
 * Without the bucket the chart quietly implied that the top N was the whole
 * dataset. With `analysis.v1` producing 57 distinct topics from 120 responses,
 * eight bars were hiding roughly six sevenths of the tagging.
 */
export function crossTabTopicSentimentWithOther(
  records: ReadonlyArray<Pick<AnalyzedRecord, 'topics' | 'sentiment'>>,
  limit: number = DEFAULT_TOP_TOPICS,
): TopicSentimentBreakdown {
  const { tail, distinctCount } = distributeTopics(records, limit)
  const rows = crossTabTopicSentiment(records, limit)

  if (tail.length === 0) {
    return { rows, other: null, distinctCount }
  }

  const tailTerms = new Set(tail.map((entry) => entry.term))
  const counts = { ...EMPTY }

  for (const record of records) {
    const seen = new Set<string>()
    for (const raw of record.topics) {
      const topic = normalizeTerm(raw)
      if (!tailTerms.has(topic) || seen.has(topic)) continue
      seen.add(topic)
      counts[record.sentiment] += 1
    }
  }

  const total = tail.reduce((sum, entry) => sum + entry.count, 0)
  const shares = { ...EMPTY }
  for (const sentiment of SENTIMENTS) {
    shares[sentiment] = total === 0 ? 0 : counts[sentiment] / total
  }

  return {
    rows,
    other: { topic: OTHER_TOPIC_LABEL, total, counts, shares },
    distinctCount,
  }
}
