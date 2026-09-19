import { describe, expect, it } from 'vitest'
import { aggregateResults } from '@/modules/reporting'
import type { Sentiment } from '@/types/domain'

function result(sentiment: Sentiment, topics: string[], confidence = 0.9) {
  return {
    responseId: crypto.randomUUID(),
    sentiment,
    confidence,
    topics,
    summary: 'ringkasan',
  }
}

describe('aggregateResults', () => {
  it('counts sentiments and computes their shares', () => {
    const aggregate = aggregateResults([
      result('positive', ['konsumsi']),
      result('positive', ['konsumsi']),
      result('negative', ['antrian']),
      result('neutral', []),
    ])

    expect(aggregate.totalResponses).toBe(4)
    expect(aggregate.sentimentCounts).toEqual({ positive: 2, neutral: 1, negative: 1 })
    expect(aggregate.sentimentShares.positive).toBeCloseTo(0.5)
  })

  it('merges topics that differ only by case or spacing', () => {
    const aggregate = aggregateResults([
      result('positive', ['Konsumsi']),
      result('negative', ['konsumsi ']),
    ])

    expect(aggregate.topics).toHaveLength(1)
    expect(aggregate.topics[0]).toMatchObject({ topic: 'konsumsi', count: 2 })
  })

  it('orders topics by frequency', () => {
    const aggregate = aggregateResults([
      result('positive', ['antrian']),
      result('positive', ['konsumsi']),
      result('negative', ['konsumsi']),
    ])

    expect(aggregate.topics.map((topic) => topic.topic)).toEqual(['konsumsi', 'antrian'])
  })

  it('counts low-confidence classifications for manual review', () => {
    const aggregate = aggregateResults([
      result('neutral', [], 0.2),
      result('positive', [], 0.95),
    ])

    expect(aggregate.lowConfidenceCount).toBe(1)
  })

  it('returns zero shares for an empty result set', () => {
    const aggregate = aggregateResults([])
    expect(aggregate.totalResponses).toBe(0)
    expect(aggregate.sentimentShares.negative).toBe(0)
  })
})
