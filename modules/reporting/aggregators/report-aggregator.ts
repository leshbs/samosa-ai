import { buildTopicBreakdown, countSentiments } from '@/modules/analysis'
import type { Sentiment, TopicBreakdown } from '@/types/domain'

/** Enough context for the summary prompt without blowing up the token bill. */
const MAX_SAMPLE_QUOTES = 12
const MAX_TOP_TOPICS = 8

export type AggregateInput = ReadonlyArray<{
  responseId: string
  sentiment: Sentiment | null
  confidence: number | null
  topics: string[]
  summary: string | null
}>

export type ReportAggregate = {
  totalResponses: number
  sentimentCounts: Record<Sentiment, number>
  sentimentShares: Record<Sentiment, number>
  topics: TopicBreakdown[]
  /** A spread of quotes across sentiments, so the summary is not one-sided. */
  sampleQuotes: string[]
  lowConfidenceCount: number
}

const LOW_CONFIDENCE_THRESHOLD = 0.5

export function aggregateResults(results: AggregateInput): ReportAggregate {
  // Shares are of the results that were read for sentiment.
  const total = results.filter((result) => result.sentiment !== null).length
  const sentimentCounts = countSentiments(results.map((result) => result.sentiment))
  const topics = buildTopicBreakdown(results).slice(0, MAX_TOP_TOPICS)

  const shareOf = (sentiment: Sentiment): number =>
    total === 0 ? 0 : sentimentCounts[sentiment] / total

  return {
    totalResponses: total,
    sentimentCounts,
    sentimentShares: {
      positive: shareOf('positive'),
      neutral: shareOf('neutral'),
      negative: shareOf('negative'),
    },
    topics,
    sampleQuotes: pickSampleQuotes(results),
    lowConfidenceCount: results.filter(
      (result) =>
        result.confidence !== null && result.confidence < LOW_CONFIDENCE_THRESHOLD,
    ).length,
  }
}

function pickSampleQuotes(results: AggregateInput): string[] {
  const perSentiment = Math.ceil(MAX_SAMPLE_QUOTES / 3)
  const sentiments: Sentiment[] = ['negative', 'positive', 'neutral']

  return sentiments
    .flatMap((sentiment) =>
      results
        .filter((result) => result.sentiment === sentiment && result.summary)
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, perSentiment)
        .map((result) => result.summary as string),
    )
    .slice(0, MAX_SAMPLE_QUOTES)
}
