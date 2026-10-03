import { describe, expect, it } from 'vitest'
import {
  printableReport,
  reportFileStem,
  truncateQuote,
  type ReportDocumentData,
} from '@/modules/reporting'

function term(name: string, count: number) {
  return { term: name, count, share: 0 }
}

function fixture(overrides: Partial<ReportDocumentData> = {}): ReportDocumentData {
  return {
    organizationName: 'OSIS SMA 1',
    datasetName: 'Pensi 2026',
    generatedAt: '3 Okt 2026 10.00',
    promptVersion: 'analysis.v2',
    summary: 'Ringkasan.',
    insights: [],
    sentiment: {
      total: 128,
      counts: { positive: 60, neutral: 40, negative: 28 },
      shares: { positive: 60 / 128, neutral: 40 / 128, negative: 28 / 128 },
      dominant: 'positive',
    },
    noContent: 12,
    topics: Array.from({ length: 14 }, (_, i) => term(`topik ${i}`, 20 - i)),
    keywords: Array.from({ length: 20 }, (_, i) => term(`kata ${i}`, 30 - i)),
    topResponsesByTopic: Array.from({ length: 7 }, (_, i) => ({
      topic: `topik ${i}`,
      responses: Array.from({ length: 5 }, () => ({
        text: 'x'.repeat(400),
        sentiment: 'negative' as const,
      })),
    })),
    topicTail: [term('ekor', 1)],
    provenance: {
      modelId: 'gpt-4o-mini',
      promptVersion: 'analysis.v2',
      analyzedAt: '3 Okt 2026 10.00',
      analyzed: 128,
      failed: 0,
      runBy: null,
      cost: null,
    },
    ...overrides,
  }
}

describe('printableReport', () => {
  it('caps topics, keywords and quotes so the length follows topics, not rows', () => {
    const view = printableReport(fixture())

    expect(view.topics).toHaveLength(10)
    expect(view.keywords).toHaveLength(12)
    expect(view.quoted).toHaveLength(5)
    expect(view.quoted[0]?.responses).toHaveLength(3)
    expect(view.quoted[0]?.responses[0]?.text.endsWith('...')).toBe(true)
  })

  it('follows the organization report defaults', () => {
    const view = printableReport(
      fixture({
        preferences: {
          includeQuotes: false,
          includeTopicTail: true,
          includeProvenance: false,
        },
      }),
    )

    expect(view.quoted).toEqual([])
    expect(view.tail).toHaveLength(1)
    expect(view.provenance).toBeNull()
    expect(view.provenanceFacts).toEqual([])
  })

  it('lists the respondents who gave no aspiration among the provenance facts', () => {
    const facts = new Map(printableReport(fixture()).provenanceFacts)

    expect(facts.get('Aspirasi dianalisis')).toBe('128')
    expect(facts.get('Tanpa aspirasi')).toBe('12')
    // Nothing failed, so the line is left out rather than printed as 0.
    expect(facts.has('Gagal dianalisis')).toBe(false)
  })

  it('leaves the no-aspiration fact out when the job never counted it', () => {
    const facts = new Map(printableReport(fixture({ noContent: null })).provenanceFacts)
    expect(facts.has('Tanpa aspirasi')).toBe(false)
  })
})

describe('truncateQuote', () => {
  it('collapses whitespace and keeps short quotes whole', () => {
    expect(truncateQuote('  kursi \n kurang  ')).toBe('kursi kurang')
  })
})

describe('reportFileStem', () => {
  it('names the saved PDF after the dataset', () => {
    expect(reportFileStem('Pensi 2026!')).toBe('samosa-pensi-2026')
    expect(reportFileStem('???')).toBe('samosa-laporan')
  })
})
