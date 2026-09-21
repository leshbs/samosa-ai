import { aggregateKeywords, DEFAULT_TOP_KEYWORDS, type KeywordCount } from './keywords'
import { aggregateSentiment, type SentimentDistribution } from './sentiment'
import { crossTabTopicSentiment, type TopicSentimentRow } from './cross-tab'
import { aggregateTopics, DEFAULT_TOP_TOPICS, type TopicCount } from './topics'
import type { AnalyzedRecord } from './types'

export type DashboardData = {
  sentiment: SentimentDistribution
  topics: TopicCount[]
  keywords: KeywordCount[]
  topicSentiment: TopicSentimentRow[]
  /** Responses the model tagged with no topic at all — a blind spot worth admitting. */
  untaggedCount: number
}

export type DashboardOptions = {
  topTopics?: number
  topKeywords?: number
}

/**
 * Everything the report dashboard draws, in one pass over the results. Kept
 * pure and free of database access so the whole page can be exercised from a
 * fixture, and so a chart never triggers its own query.
 */
export function buildDashboardData(
  records: readonly AnalyzedRecord[],
  options: DashboardOptions = {},
): DashboardData {
  const topTopics = options.topTopics ?? DEFAULT_TOP_TOPICS
  const topKeywords = options.topKeywords ?? DEFAULT_TOP_KEYWORDS

  return {
    sentiment: aggregateSentiment(records),
    topics: aggregateTopics(records, topTopics),
    keywords: aggregateKeywords(records, topKeywords),
    topicSentiment: crossTabTopicSentiment(records, topTopics),
    untaggedCount: records.filter(
      (record) => record.topics.filter((topic) => topic.trim()).length === 0,
    ).length,
  }
}
