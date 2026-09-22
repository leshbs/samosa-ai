import type { Sentiment } from '@/types/domain'
import { normalizeTerm } from './types'

export const DEFAULT_QUOTES_PER_TOPIC = 3

export type QuotableRecord = {
  responseText: string
  sentiment: Sentiment
  confidence: number
  topics: readonly string[]
}

export type TopicQuotes = {
  topic: string
  responses: Array<{ text: string; sentiment: Sentiment }>
}

/**
 * Illustrative responses for each topic, for the part of a report where a
 * reader stops trusting percentages and wants to see what someone actually
 * wrote.
 *
 * One complaint and one piece of praise come first where both exist, then the
 * most confident remaining calls. Ranking by confidence alone tends to return
 * three versions of the same sentence, which reads as cherry-picking even when
 * it is not.
 */
export function topResponsesByTopic(
  records: readonly QuotableRecord[],
  topics: ReadonlyArray<{ term: string }>,
  perTopic: number = DEFAULT_QUOTES_PER_TOPIC,
): TopicQuotes[] {
  return topics.map(({ term }) => {
    const matching = records
      .filter(
        (record) =>
          record.responseText.trim().length > 0 &&
          record.topics.some((topic) => normalizeTerm(topic) === term),
      )
      .sort((a, b) => b.confidence - a.confidence)

    const picked: QuotableRecord[] = []
    const take = (record: QuotableRecord | undefined) => {
      if (record && !picked.includes(record)) picked.push(record)
    }

    take(matching.find((record) => record.sentiment === 'negative'))
    take(matching.find((record) => record.sentiment === 'positive'))
    for (const record of matching) {
      if (picked.length >= perTopic) break
      take(record)
    }

    return {
      topic: term,
      responses: picked.slice(0, perTopic).map((record) => ({
        text: record.responseText,
        sentiment: record.sentiment,
      })),
    }
  })
}
