import { describe, expect, it } from 'vitest'
import { evaluatedCount, questionMode } from '@/modules/analysis/services/question-counts'
import {
  aggregateScale,
  aggregateSentiment,
  buildDashboardData,
  buildHomeSummary,
  crossTabTopicSentiment,
  printableReport,
  reportCountLine,
  reportPdfPayload,
  sectionCountLine,
  topResponsesByTopic,
  type ReportDocumentData,
  type ReportDocumentSection,
} from '@/modules/reporting'

const value = (term: string) => ({ topics: [term] })

describe('aggregateScale', () => {
  it('counts each value and orders the bars by value, not by count', () => {
    const scale = aggregateScale([
      ...Array.from({ length: 5 }, () => value('5')),
      ...Array.from({ length: 9 }, () => value('4')),
      ...Array.from({ length: 3 }, () => value('10')),
      value('2'),
    ])

    // "10" after "5": numbers, not strings.
    expect(scale.values.map((entry) => [entry.term, entry.count])).toEqual([
      ['2', 1],
      ['4', 9],
      ['5', 5],
      ['10', 3],
    ])
    expect(scale.answers).toBe(18)
    expect(scale.mean).toBeCloseTo((2 + 36 + 25 + 30) / 18)
    expect(scale.mostCommon).toBe('4')
    expect(scale.mostCommonCount).toBe(9)
    // A share of answers, so the bars read as "half gave a 4".
    expect(scale.values[1]?.share).toBe(0.5)
  })

  it('leaves worded answers out of the mean and says how many were numbers', () => {
    const scale = aggregateScale([
      value('4'),
      value('5'),
      value('sangat setuju'),
      value('Sangat Setuju'),
    ])

    expect(scale.numericAnswers).toBe(2)
    expect(scale.mean).toBe(4.5)
    // Words after the numbers, counted as one whatever the capitals.
    expect(scale.values.map((entry) => entry.term)).toEqual(['4', '5', 'sangat setuju'])
    expect(scale.mostCommon).toBe('sangat setuju')
  })

  it('has no mean when nobody answered with a number', () => {
    const scale = aggregateScale([value('setuju'), value('tidak setuju')])
    expect(scale.mean).toBeNull()
    expect(scale.mostCommon).toBe('setuju, tidak setuju')
  })

  it('names no most common value when too many tie for it', () => {
    const scale = aggregateScale(['1', '2', '3', '4'].map(value))
    expect(scale.mostCommon).toBeNull()
  })

  it('keeps the rare values out of the bars but not out of the count', () => {
    const scale = aggregateScale(
      [
        ...Array.from({ length: 6 }, () => value('7')),
        value('1'),
        value('2'),
        value('3'),
      ],
      2,
    )

    expect(scale.values).toHaveLength(2)
    expect(scale.otherCount).toBe(2)
    expect(scale.answers).toBe(9)
  })
})

describe('aggregators with answers that have no sentiment', () => {
  const rows = [
    { sentiment: 'positive' as const, topics: ['konsumsi'], keywords: [] },
    { sentiment: 'negative' as const, topics: ['konsumsi'], keywords: [] },
    // Answers to a question that asks for a choice.
    { sentiment: null, topics: ['outbound'], keywords: [] },
    { sentiment: null, topics: ['outbound'], keywords: [] },
  ]

  it('takes shares of the answers that were judged, not of all answers', () => {
    const sentiment = aggregateSentiment(rows)

    expect(sentiment.total).toBe(2)
    expect(sentiment.shares.positive).toBe(0.5)
    // Counted as neutral, the two choices would have made this 25%.
    expect(sentiment.counts.neutral).toBe(0)
  })

  it('says how many answers there are apart from how many were judged', () => {
    const data = buildDashboardData(rows)
    expect(data.answers).toBe(4)
    expect(data.sentiment.total).toBe(2)
  })

  it('counts a topic without adding a sentiment nobody gave it', () => {
    const [, outbound] = crossTabTopicSentiment(rows)
    expect(outbound).toMatchObject({
      topic: 'outbound',
      total: 2,
      counts: { positive: 0, neutral: 0, negative: 0 },
    })
  })

  it('quotes answers that have no sentiment, in sheet order', () => {
    const [group] = topResponsesByTopic(
      [
        {
          responseText: 'Belajar kerja sama',
          sentiment: null,
          confidence: null,
          topics: ['kerja sama tim'],
        },
        {
          responseText: 'Kompak sama temen',
          sentiment: null,
          confidence: null,
          topics: ['kerja sama tim'],
        },
      ],
      [{ term: 'kerja sama tim' }],
    )

    expect(group?.responses).toEqual([
      { text: 'Belajar kerja sama', sentiment: null },
      { text: 'Kompak sama temen', sentiment: null },
    ])
  })
})

describe('questionMode and evaluatedCount', () => {
  const counts = (
    analyzed: number,
    mode: 'evaluative' | 'categorical' | 'scale' | null,
  ) => ({
    analyzed,
    noContent: 0,
    failed: 0,
    mode,
  })

  it('reads a job from before modes as evaluative throughout', () => {
    const old = { questionCounts: { q1: counts(127, null) }, processedCount: 127 }
    expect(questionMode(old, 'q1')).toBe('evaluative')
    expect(questionMode({ questionCounts: {} }, 'q1')).toBe('evaluative')
    expect(evaluatedCount(old)).toBe(127)
    expect(evaluatedCount({ questionCounts: {}, processedCount: 181 })).toBe(181)
  })

  it('counts only the answers that were read for sentiment', () => {
    const job = {
      questionCounts: {
        q1: counts(127, 'evaluative'),
        q2: counts(220, 'categorical'),
        q3: counts(228, 'scale'),
      },
      processedCount: 575,
    }

    expect(questionMode(job, 'q2')).toBe('categorical')
    expect(evaluatedCount(job)).toBe(127)
  })

  it('is zero for a dataset with no question that asks for a judgement', () => {
    expect(
      evaluatedCount({
        questionCounts: { q1: counts(220, 'categorical') },
        processedCount: 220,
      }),
    ).toBe(0)
  })
})

describe('buildHomeSummary with questions that have no sentiment', () => {
  const job = {
    id: 'a',
    datasetName: 'Pensi',
    status: 'succeeded' as const,
    processedCount: 500,
    totalCount: 500,
    costMicroIdr: 0,
    createdAt: '2026-09-20T03:00:00Z',
    finishedAt: '2026-09-20T03:05:00Z',
  }
  const summarize = (evaluated: number) =>
    buildHomeSummary({
      jobs: [{ ...job, evaluatedCount: evaluated }],
      positiveCounts: { a: 60 },
      negativeCounts: { a: 20 },
      now: new Date('2026-09-27T10:00:00+07:00'),
      timeZone: 'Asia/Jakarta',
    })

  it('takes the positive share of the judged answers, not of every answer', () => {
    const summary = summarize(100)

    // 60 of the 100 answers read for sentiment — not 60 of 500.
    expect(summary.recent[0]?.positiveShare).toBe(0.6)
    expect(summary.latestReport?.sentiment).toEqual({
      positive: 60,
      neutral: 20,
      negative: 20,
    })
    // Still 500 answers analysed.
    expect(summary.analyzedTotal).toBe(500)
  })

  it('shows no share for a report with nothing judged, rather than 0%', () => {
    const summary = summarize(0)

    expect(summary.recent[0]?.positiveShare).toBeNull()
    expect(summary.latestReport?.sentiment).toBeNull()
    expect(summary.positiveTrend).toEqual([])
    expect(summary.positiveAverage).toBeNull()
  })
})

function term(name: string, count: number) {
  return { term: name, count, share: 0 }
}

const NO_SENTIMENT = {
  total: 0,
  counts: { positive: 0, neutral: 0, negative: 0 },
  shares: { positive: 0, neutral: 0, negative: 0 },
  dominant: null,
}

function section(overrides: Partial<ReportDocumentSection>): ReportDocumentSection {
  return {
    questionId: 'q1',
    questionText: 'Kritik dan saran',
    mode: 'evaluative',
    answers: 100,
    sentiment: {
      total: 100,
      counts: { positive: 50, neutral: 20, negative: 30 },
      shares: { positive: 0.5, neutral: 0.2, negative: 0.3 },
      dominant: 'positive',
    },
    noContent: 10,
    topics: [term('konsumsi', 40)],
    keywords: [term('telat', 12)],
    topResponsesByTopic: [
      {
        topic: 'konsumsi',
        responses: [{ text: 'Konsumsi telat', sentiment: 'negative' }],
      },
    ],
    topicTail: [term('ekor', 1)],
    ...overrides,
  }
}

/** One question of each kind: the round's definition of done. */
function mixed(overrides: Partial<ReportDocumentData> = {}): ReportDocumentData {
  return {
    organizationName: 'OSIS SMA 1',
    datasetName: 'Pensi 2026',
    generatedAt: '3 Okt 2026 10.00',
    promptVersion: 'analysis.v3',
    summary: 'Ringkasan.',
    insights: [
      {
        title: 'Konsumsi',
        detail: 'Telat.',
        evidenceResponseIds: ['r1'],
        questionId: 'q1',
      },
      {
        title: 'Outbound',
        detail: 'Favorit.',
        evidenceResponseIds: [],
        questionId: 'q3',
      },
      {
        title: 'Lintas',
        detail: 'Dua pertanyaan.',
        evidenceResponseIds: [],
        questionId: null,
      },
    ],
    answers: 420,
    noContent: 14,
    sections: [
      section({}),
      section({
        questionId: 'q2',
        questionText: 'Nilai apa yang kamu pelajari?',
        mode: 'thematic',
        answers: 90,
        sentiment: NO_SENTIMENT,
        noContent: 4,
        topics: [term('kerja sama tim', 30)],
        keywords: [term('kerja sama', 22)],
        topResponsesByTopic: [
          {
            topic: 'kerja sama tim',
            responses: [{ text: 'Belajar kompak', sentiment: null }],
          },
        ],
      }),
      section({
        questionId: 'q3',
        questionText: 'Kegiatan apa yang paling seru?',
        mode: 'categorical',
        answers: 110,
        sentiment: NO_SENTIMENT,
        noContent: null,
        topics: [term('outbound', 60), term('api unggun', 40)],
        // A model that returned these anyway must not get them printed.
        keywords: [term('seru', 9)],
        topResponsesByTopic: [
          { topic: 'outbound', responses: [{ text: 'Outbond', sentiment: null }] },
        ],
      }),
      section({
        questionId: 'q4',
        questionText: 'Seberapa puas? (1-5)',
        mode: 'scale',
        answers: 120,
        sentiment: NO_SENTIMENT,
        noContent: null,
        topics: [term('4', 70), term('5', 50)],
        keywords: [],
        topResponsesByTopic: [],
        scale: aggregateScale([
          ...Array.from({ length: 70 }, () => value('4')),
          ...Array.from({ length: 50 }, () => value('5')),
        ]),
      }),
    ],
    provenance: {
      modelId: 'gpt-4o-mini',
      promptVersion: 'analysis.v3',
      analyzedAt: '3 Okt 2026 10.00',
      analyzed: 420,
      failed: 0,
      runBy: null,
      cost: null,
    },
    ...overrides,
  }
}

describe('printableReport by mode', () => {
  const view = printableReport(mixed())
  const [evaluative, thematic, categorical, scale] = view.sections

  it('names what the bars of each section count', () => {
    expect(view.sections.map((s) => [s.mode, s.termsTitle])).toEqual([
      ['evaluative', 'Topik teratas'],
      ['thematic', 'Topik teratas'],
      ['categorical', 'Pilihan jawaban'],
      ['scale', 'Sebaran jawaban'],
    ])
  })

  it('prints topics, keywords and quotes for prose, with or without sentiment', () => {
    expect(evaluative?.quoted).toHaveLength(1)
    expect(thematic?.topics).toEqual([term('kerja sama tim', 30)])
    expect(thematic?.keywords).toEqual([term('kerja sama', 22)])
    expect(thematic?.quoted[0]?.responses[0]).toEqual({
      text: 'Belajar kompak',
      sentiment: null,
    })
  })

  it('prints a choice question as its choices and nothing else', () => {
    expect(categorical?.topics.map((t) => t.term)).toEqual(['outbound', 'api unggun'])
    expect(categorical?.keywords).toEqual([])
    expect(categorical?.quoted).toEqual([])
    expect(categorical?.scale).toBeNull()
  })

  it('prints a scale question as a distribution with its mean in words', () => {
    expect(scale?.topics).toEqual([])
    expect(scale?.scale?.values.map((v) => v.term)).toEqual(['4', '5'])
    expect(scale?.scaleLine).toBe(
      'Rata-rata 4,42 dari 120 jawaban berupa angka · paling sering 4 (70 jawaban)',
    )
    // Only a scale section has the sentence.
    expect(evaluative?.scaleLine).toBeNull()
  })

  it('says "jawaban" once a question does not ask for a judgement', () => {
    expect(view.aspirations).toBe(false)
    expect(view.countLine).toBe('4 pertanyaan · 420 dari 434 jawaban dianalisis')
    expect(view.sections.map((s) => s.countLine)).toEqual([
      // The evaluative one still speaks of aspirations.
      '100 dari 110 jawaban berisi aspirasi',
      '90 dari 94 jawaban dianalisis',
      '110 jawaban dianalisis',
      '120 jawaban dianalisis',
    ])
    const facts = new Map(view.provenanceFacts)
    expect(facts.get('Jawaban dianalisis')).toBe('420')
    expect(facts.get('Tidak berisi jawaban')).toBe('14')
    expect(facts.has('Aspirasi dianalisis')).toBe(false)
  })

  it('says which question an insight comes from, and nothing for one that spans several', () => {
    expect(view.insights.map((insight) => insight.origin)).toEqual([
      'Kritik dan saran',
      'Kegiatan apa yang paling seru?',
      null,
    ])
    expect(reportPdfPayload(mixed(), {}).insights.map((i) => i.origin)).toEqual([
      'Kritik dan saran',
      'Kegiatan apa yang paling seru?',
      null,
    ])
  })

  it('names no origin in a one-question report: there is nothing to tell apart', () => {
    const one = printableReport(mixed({ sections: [section({})] }))
    expect(one.insights.every((insight) => insight.origin === null)).toBe(true)
    expect(one.aspirations).toBe(true)
  })
})

describe('count lines', () => {
  it('counts respondents who answered when the one question is not evaluative', () => {
    expect(reportCountLine(110, 6, 1, false)).toBe('110 dari 116 responden menjawab')
    expect(reportCountLine(110, null, 1, false)).toBe('110 jawaban')
  })

  it('keeps the wording of a report whose questions all ask for aspirations', () => {
    expect(reportCountLine(128, 12, 1)).toBe('128 dari 140 responden memberikan aspirasi')
    expect(reportCountLine(218, 16, 2)).toBe(
      '2 pertanyaan · 218 dari 234 jawaban berisi aspirasi',
    )
    expect(sectionCountLine(128, 12)).toBe('128 dari 140 jawaban berisi aspirasi')
    expect(sectionCountLine(128, 0, 'categorical')).toBe('128 jawaban dianalisis')
  })
})
