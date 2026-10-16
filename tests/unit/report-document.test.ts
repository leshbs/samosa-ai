import { describe, expect, it } from 'vitest'
import {
  PRINTED_INSIGHTS,
  insightSupportLine,
  printableReport,
  reportCountLine,
  reportFileStem,
  reportPdfPayload,
  truncateQuote,
  type ReportDocumentData,
  type ReportDocumentSection,
} from '@/modules/reporting'

function term(name: string, count: number) {
  return { term: name, count, share: 0 }
}

function sentiment(positive: number, neutral: number, negative: number) {
  const total = positive + neutral + negative
  return {
    total,
    counts: { positive, neutral, negative },
    shares: {
      positive: positive / total,
      neutral: neutral / total,
      negative: negative / total,
    },
    dominant: 'positive' as const,
  }
}

function section(overrides: Partial<ReportDocumentSection> = {}): ReportDocumentSection {
  return {
    questionText: 'Kritik dan saran',
    mode: 'evaluative',
    answers: 128,
    sentiment: sentiment(60, 40, 28),
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
    ...overrides,
  }
}

function fixture(overrides: Partial<ReportDocumentData> = {}): ReportDocumentData {
  return {
    organizationName: 'OSIS SMA 1',
    datasetName: 'Pensi 2026',
    generatedAt: '3 Okt 2026 10.00',
    promptVersion: 'analysis.v2',
    summary: 'Ringkasan.',
    insights: [],
    answers: 128,
    noContent: 12,
    sections: [section()],
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

/** A survey with two open questions: 128 + 90 analysed, 12 + 4 non-answers. */
function twoQuestions(): ReportDocumentData {
  return fixture({
    answers: 218,
    noContent: 16,
    sections: [
      section({ questionId: 'q1' }),
      section({
        questionId: 'q2',
        questionText: 'Apa yang paling berkesan?',
        answers: 90,
        sentiment: sentiment(70, 15, 5),
        noContent: 4,
        topics: [term('penampilan band', 30)],
      }),
    ],
  })
}

describe('printableReport', () => {
  it('caps topics, keywords and quotes so the length follows topics, not rows', () => {
    const [only] = printableReport(fixture()).sections

    expect(only?.topics).toHaveLength(10)
    expect(only?.keywords).toHaveLength(12)
    expect(only?.quoted).toHaveLength(5)
    expect(only?.quoted[0]?.responses).toHaveLength(3)
    expect(only?.quoted[0]?.responses[0]?.text.endsWith('...')).toBe(true)
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

    expect(view.sections[0]?.quoted).toEqual([])
    expect(view.sections[0]?.tail).toHaveLength(1)
    expect(view.provenance).toBeNull()
    expect(view.provenanceFacts).toEqual([])
  })

  it('lists the respondents who gave no aspiration among the provenance facts', () => {
    const facts = new Map(printableReport(fixture()).provenanceFacts)

    expect(facts.get('Aspirasi dianalisis')).toBe('128')
    expect(facts.get('Tanpa aspirasi')).toBe('12')
    // Nothing failed, so the line is left out rather than printed as 0.
    expect(facts.has('Gagal dianalisis')).toBe(false)
    // One question: saying so would be noise.
    expect(facts.has('Pertanyaan')).toBe(false)
  })

  it('leaves the no-aspiration fact out when the job never counted it', () => {
    const facts = new Map(printableReport(fixture({ noContent: null })).provenanceFacts)
    expect(facts.has('Tanpa aspirasi')).toBe(false)
  })

  it('prints a one-question report with no question heading, as it always did', () => {
    const view = printableReport(fixture())

    expect(view.sections).toHaveLength(1)
    expect(view.sections[0]?.title).toBeNull()
    expect(view.sections[0]?.countLine).toBeNull()
    expect(view.countLine).toBe('128 dari 140 responden memberikan aspirasi')
  })

  it('gives every question its own section, under what was asked', () => {
    const view = printableReport(twoQuestions())

    expect(view.sections.map((s) => s.title)).toEqual([
      'Kritik dan saran',
      'Apa yang paling berkesan?',
    ])
    // Each section counts its own answers and its own non-answers.
    expect(view.sections.map((s) => s.countLine)).toEqual([
      '128 dari 140 jawaban berisi aspirasi',
      '90 dari 94 jawaban berisi aspirasi',
    ])
    // Topics are never pooled: the second question has its one topic only.
    expect(view.sections[1]?.topics).toEqual([term('penampilan band', 30)])
    expect(new Map(view.provenanceFacts).get('Pertanyaan')).toBe('2')
  })

  it('counts answers, not respondents, once there are several questions', () => {
    expect(printableReport(twoQuestions()).countLine).toBe(
      '2 pertanyaan · 218 dari 234 jawaban berisi aspirasi',
    )
  })
})

describe('reportCountLine', () => {
  it('reads as a plain count when non-answers were never measured', () => {
    expect(reportCountLine(181, null, 1)).toBe('181 aspirasi')
    expect(reportCountLine(181, null, 3)).toBe('3 pertanyaan · 181 jawaban dianalisis')
    // Zero is "none found", and adds nothing to say.
    expect(reportCountLine(181, 0, 1)).toBe('181 aspirasi')
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

describe('reportPdfPayload', () => {
  const insight = {
    title: 'Konsumsi jadi keluhan utama',
    detail: 'Dua dari lima aspirasi.',
    evidenceResponseIds: ['r1', 'gone', 'r2', 'r3'],
  }
  const quotes = { r1: 'Konsumsi  telat', r2: 'y'.repeat(400), r3: 'Kursi kurang' }

  it('names the file and carries the capped view, so the browser decides nothing', () => {
    const payload = reportPdfPayload(fixture(), {})

    expect(payload.fileName).toBe('samosa-pensi-2026.pdf')
    expect(payload.view).toEqual(printableReport(fixture()))
    expect(payload.logoSrc).toBeNull()
  })

  it('puts at most two cited quotes under an insight, cut to length', () => {
    const payload = reportPdfPayload(fixture({ insights: [insight] }), quotes)

    // "gone" was deleted after the summary was written: skipped, not printed empty.
    expect(payload.insights[0]?.quotes).toEqual([
      'Konsumsi telat',
      `${'y'.repeat(260)}...`,
    ])
  })

  it('writes the prepared-by line once, with the title only when there is one', () => {
    const named = { name: 'Rani Putri', title: 'Sekretaris OSIS' }

    expect(reportPdfPayload(fixture({ preparedBy: named }), {}).preparedLine).toBe(
      'Disiapkan oleh Rani Putri · Sekretaris OSIS',
    )
    expect(
      reportPdfPayload(fixture({ preparedBy: { ...named, title: '' } }), {}).preparedLine,
    ).toBe('Disiapkan oleh Rani Putri')
    expect(reportPdfPayload(fixture(), {}).preparedLine).toBeNull()
  })

  it('prints the first findings in full and lists the rest by title', () => {
    const counted = Array.from({ length: PRINTED_INSIGHTS + 2 }, (_, index) => ({
      title: `Temuan ${index + 1}`,
      detail: 'd',
      evidenceResponseIds: ['r1', 'r3'],
      support: 20 - index,
      topics: index === 0 ? ['kualitas audio', 'kualitas mic'] : ['kantin'],
      signal: index === 0 ? ('negative' as const) : ('topic' as const),
    }))

    const payload = reportPdfPayload(fixture({ insights: counted }), quotes)

    expect(payload.insights).toHaveLength(PRINTED_INSIGHTS)
    expect(payload.insights[0]?.supportLine).toBe(
      'Disebut di 20 jawaban · hampir semua negatif · mencakup kualitas audio, kualitas mic',
    )
    expect(payload.insights[1]?.supportLine).toBe('Disebut di 19 jawaban')
    expect(payload.view.moreInsights).toEqual([
      { title: 'Temuan 6', origin: null, support: 15 },
      { title: 'Temuan 7', origin: null, support: 14 },
    ])
  })

  it('gives a finding from before summary.v4 no count line', () => {
    expect(insightSupportLine(insight)).toBeNull()
    expect(
      reportPdfPayload(fixture({ insights: [insight] }), quotes).insights[0],
    ).toMatchObject({
      supportLine: null,
    })
  })

  it('is plain JSON: nothing is lost crossing the network', () => {
    const payload = reportPdfPayload(twoQuestions(), quotes)
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
