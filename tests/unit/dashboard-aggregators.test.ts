// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  aggregateKeywords,
  aggregateSentiment,
  aggregateTopics,
  buildDashboardData,
  crossTabTopicSentiment,
  type AnalyzedRecord,
} from '@/modules/reporting'

const record = (
  sentiment: AnalyzedRecord['sentiment'],
  topics: string[],
  keywords: string[] = [],
): AnalyzedRecord => ({ sentiment, topics, keywords })

const FIXTURE: AnalyzedRecord[] = [
  record('negative', ['Kantin', 'Fasilitas'], ['antre', 'mahal']),
  record('negative', ['kantin '], ['antre']),
  record('neutral', ['Kantin'], ['menu']),
  record('positive', ['Ekstrakurikuler'], ['seru', 'antre']),
  record('positive', ['ekstrakurikuler', 'Fasilitas'], ['seru']),
]

describe('aggregateSentiment', () => {
  it('counts each sentiment and turns it into a share of the whole', () => {
    const result = aggregateSentiment(FIXTURE)

    expect(result.total).toBe(5)
    expect(result.counts).toEqual({ positive: 2, neutral: 1, negative: 2 })
    expect(result.shares.neutral).toBeCloseTo(0.2)
  })

  it('reports no dominant sentiment when the top two are tied', () => {
    // Two positive and two negative: calling this dataset "mostly positive"
    // would be a coin flip dressed up as a finding.
    expect(aggregateSentiment(FIXTURE).dominant).toBeNull()
  })

  it('names the dominant sentiment when one genuinely leads', () => {
    expect(aggregateSentiment([...FIXTURE, record('negative', [])]).dominant).toBe(
      'negative',
    )
  })

  it('returns zeroes rather than dividing by zero for an empty set', () => {
    const result = aggregateSentiment([])

    expect(result.total).toBe(0)
    expect(result.shares).toEqual({ positive: 0, neutral: 0, negative: 0 })
    expect(result.dominant).toBeNull()
  })
})

describe('aggregateTopics', () => {
  it('folds case and stray whitespace into one topic', () => {
    const topics = aggregateTopics(FIXTURE)

    expect(topics[0]).toMatchObject({ term: 'kantin', count: 3 })
    expect(topics.map((topic) => topic.term)).not.toContain('Kantin')
  })

  it('counts a topic once per response even when it is tagged twice', () => {
    const topics = aggregateTopics([record('neutral', ['Kantin', 'kantin'])])

    expect(topics).toEqual([{ term: 'kantin', count: 1, share: 1 }])
  })

  it('breaks ties alphabetically so the bar order does not shuffle', () => {
    const topics = aggregateTopics(FIXTURE)
    const tied = topics.filter((topic) => topic.count === 2).map((topic) => topic.term)

    expect(tied).toEqual(['ekstrakurikuler', 'fasilitas'])
  })

  it('honours the limit', () => {
    expect(aggregateTopics(FIXTURE, 2)).toHaveLength(2)
  })
})

describe('aggregateKeywords', () => {
  it('ranks keywords by how many responses mention them', () => {
    expect(aggregateKeywords(FIXTURE, 3)).toEqual([
      { term: 'antre', count: 3, share: 3 / 7 },
      { term: 'seru', count: 2, share: 2 / 7 },
      { term: 'mahal', count: 1, share: 1 / 7 },
    ])
  })
})

describe('crossTabTopicSentiment', () => {
  it('splits every ranked topic by sentiment', () => {
    const rows = crossTabTopicSentiment(FIXTURE)
    const kantin = rows.find((row) => row.topic === 'kantin')

    expect(kantin).toMatchObject({
      total: 3,
      counts: { positive: 0, neutral: 1, negative: 2 },
    })
    expect(kantin?.shares.negative).toBeCloseTo(2 / 3)
  })

  it('keeps each row summing to that topic total, not the response total', () => {
    // A response tagged with two topics is counted in both rows; the rows are
    // meant to add up per topic, never across the table.
    for (const row of crossTabTopicSentiment(FIXTURE)) {
      const summed = row.counts.positive + row.counts.neutral + row.counts.negative

      expect(summed).toBe(row.total)
    }
  })

  it('ranks rows the same way the topic chart does', () => {
    const rows = crossTabTopicSentiment(FIXTURE)

    expect(rows.map((row) => row.topic)).toEqual(
      aggregateTopics(FIXTURE).map((topic) => topic.term),
    )
  })
})

describe('buildDashboardData', () => {
  it('produces every chart-ready structure in one pass', () => {
    const data = buildDashboardData(FIXTURE)

    expect(data.sentiment.total).toBe(5)
    expect(data.topics).toHaveLength(3)
    expect(data.keywords).toHaveLength(4)
    expect(data.topicSentiment).toHaveLength(3)
  })

  it('counts responses the model left untagged', () => {
    const data = buildDashboardData([...FIXTURE, record('neutral', ['  '])])

    expect(data.untaggedCount).toBe(1)
  })

  it('survives a job whose results are all empty', () => {
    const data = buildDashboardData([])

    expect(data).toEqual({
      sentiment: {
        total: 0,
        counts: { positive: 0, neutral: 0, negative: 0 },
        shares: { positive: 0, neutral: 0, negative: 0 },
        dominant: null,
      },
      topics: [],
      keywords: [],
      topicSentiment: [],
      untaggedCount: 0,
    })
  })
})
