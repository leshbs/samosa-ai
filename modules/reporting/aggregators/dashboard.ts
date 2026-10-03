import { aggregateKeywords, DEFAULT_TOP_KEYWORDS, type KeywordCount } from './keywords'
import { aggregateScale, type ScaleSummary } from './scale'
import { aggregateSentiment, type SentimentDistribution } from './sentiment'
import { crossTabTopicSentimentWithOther, type TopicSentimentRow } from './cross-tab'
import { distributeTopics, DEFAULT_TOP_TOPICS, type TopicCount } from './topics'
import type { AnalyzedRecord } from './types'

export type DashboardData = {
  /**
   * Every record given, with a sentiment or without: what "N jawaban" counts.
   * `sentiment.total` is only the ones that were read for sentiment.
   */
  answers: number
  sentiment: SentimentDistribution
  topics: TopicCount[]
  /**
   * Topics ranked below the chart cap, kept whole. The chart collapses these
   * into one "Lainnya" bar; the list is what tells you whether the tail is
   * genuinely varied or the same idea spelled six ways.
   */
  topicTail: TopicCount[]
  /** Distinct topics before the cap — the number the "Lainnya" label quotes. */
  distinctTopicCount: number
  keywords: KeywordCount[]
  topicSentiment: TopicSentimentRow[]
  /** The tail as one drawable row, so the chart's bars account for every mention. */
  topicSentimentOther: TopicSentimentRow | null
  /** Responses the model tagged with no topic at all — a blind spot worth admitting. */
  untaggedCount: number
  /** The records read as answers to a `scale` question; meaningful only for one. */
  scale: ScaleSummary
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

  const topicDistribution = distributeTopics(records, topTopics)
  const topicSentiment = crossTabTopicSentimentWithOther(records, topTopics)

  return {
    answers: records.length,
    scale: aggregateScale(records),
    sentiment: aggregateSentiment(records),
    topics: topicDistribution.top,
    topicTail: topicDistribution.tail,
    distinctTopicCount: topicDistribution.distinctCount,
    keywords: aggregateKeywords(records, topKeywords),
    topicSentiment: topicSentiment.rows,
    topicSentimentOther: topicSentiment.other,
    untaggedCount: records.filter(
      (record) => record.topics.filter((topic) => topic.trim()).length === 0,
    ).length,
  }
}
