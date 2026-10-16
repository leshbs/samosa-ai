import { describe, expect, it } from 'vitest'
import { summaryPrompt, type SummaryPromptInput } from '@/modules/analysis/prompts'

const INPUT: SummaryPromptInput = {
  totalResponses: 46,
  sentimentCounts: { positive: 4, neutral: 1, negative: 7 },
  topTopics: [],
  topKeywords: [],
  questions: [
    {
      text: 'Kritik dan saran',
      mode: 'evaluative',
      answers: 12,
      noContent: 3,
      sentimentCounts: { positive: 4, neutral: 1, negative: 7 },
      top: [{ term: 'kualitas konsumsi', count: 3 }],
      topKeywords: [{ term: 'telat', count: 3 }],
    },
    {
      text: 'Kegiatan apa yang paling seru?',
      mode: 'categorical',
      answers: 20,
      noContent: null,
      top: [{ term: 'outbound', count: 11 }],
    },
    {
      text: 'Seberapa puas? (1-5)',
      mode: 'scale',
      answers: 14,
      noContent: 1,
      top: [
        { term: '4', count: 8 },
        { term: '5', count: 6 },
      ],
      scale: { mean: 4.428, mostCommon: '4' },
    },
  ],
  sampleQuotes: ['Konsumsi telat dua jam', 'Panitianya ramah'],
  quoteQuestions: [1, 1],
}

describe('summary.v3', () => {
  const prompt = summaryPrompt('summary.v3')

  it('names the question of each insight, and writes its insights itself', () => {
    expect(prompt.citesQuestions).toBe(true)
    expect(prompt.writesInsightsApart).toBe(false)
    expect(summaryPrompt('summary.v2').citesQuestions).toBe(false)
  })

  it('describes the report question by question, each as its kind', () => {
    const text = prompt.USER_TEMPLATE(INPUT)

    expect(text).toContain('Survei ini punya 3 pertanyaan.')
    expect(text).toContain('Pertanyaan 1 (kritik & saran): "Kritik dan saran"')
    expect(text).toContain('Jawaban dianalisis: 12 (3 lainnya tidak berisi jawaban)')
    expect(text).toContain('Pertanyaan 2 (pilihan): "Kegiatan apa yang paling seru?"')
    expect(text).toContain('Pilihan terbanyak: [{"term":"outbound","count":11}]')
    // The mean as an Indonesian reader writes it.
    expect(text).toContain('Rata-rata: 4,43 · paling sering: 4')
  })

  it('offers a sentiment split for the one question that has one', () => {
    const text = prompt.USER_TEMPLATE(INPUT)
    expect(text.match(/Distribusi sentimen/g)).toHaveLength(1)
  })

  it('numbers each quote and says which question it answers', () => {
    const text = prompt.USER_TEMPLATE(INPUT)
    expect(text).toContain('1. [P1] Konsumsi telat dua jam')
    expect(text).toContain('2. [P1] Panitianya ramah')
  })

  it('says so when there is nothing to quote', () => {
    const text = prompt.USER_TEMPLATE({ ...INPUT, sampleQuotes: [], quoteQuestions: [] })
    expect(text).toContain('(tidak ada)')
  })

  it('cuts a reply that runs over its bounds instead of throwing the summary away', () => {
    const insight = (title: string, question?: number | null) => ({
      title,
      detail: 'Detail.',
      question,
      evidence: [1, 2, 3, 4, 5],
    })
    const parsed = prompt.parse({
      summary: 'Ringkasan.',
      insights: [
        // summary.v2 refused a title over 60 characters and lost everything.
        insight('x'.repeat(140), 1),
        insight('Lintas pertanyaan', 0),
        insight('Tanpa nomor'),
        ...Array.from({ length: 6 }, (_, index) => insight(`Butir ${index}`, 2)),
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.insights).toHaveLength(6)
    expect(parsed.data.insights[0]?.title).toHaveLength(90)
    expect(parsed.data.insights[0]?.evidence).toEqual([1, 2, 3])
    expect(parsed.data.insights.map((entry) => entry.question).slice(0, 4)).toEqual([
      1,
      // 0 and a missing number both mean "not one question".
      null,
      null,
      2,
    ])
    expect(
      summaryPrompt('summary.v2').parse({
        summary: 'Ringkasan.',
        insights: [{ title: 'x'.repeat(140), detail: 'Detail.', evidence: [] }],
      }).success,
    ).toBe(false)
  })

  it('still refuses a reply with no summary or no insight at all', () => {
    expect(prompt.parse({ summary: '', insights: [] }).success).toBe(false)
    expect(prompt.parse({ summary: 'Ada.', insights: [] }).success).toBe(false)
  })

  it('gives the versions before it a null origin, since they were never asked', () => {
    const parsed = summaryPrompt('summary.v2').parse({
      summary: 'Ringkasan.',
      insights: [{ title: 'Konsumsi', detail: 'Telat.', evidence: [1] }],
    })
    expect(parsed.success && parsed.data.insights[0]?.question).toBeNull()
  })
})

describe('summary.v4', () => {
  const prompt = summaryPrompt('summary.v4')

  it('leaves the findings to insight.v1 and is not shown any quote', () => {
    const text = prompt.USER_TEMPLATE({ ...INPUT, sampleQuotes: ['Konsumsi telat'] })

    expect(prompt.writesInsightsApart).toBe(true)
    expect(text).toContain('Pertanyaan 1 (kritik & saran): "Kritik dan saran"')
    expect(text).not.toContain('Konsumsi telat')
    expect(text).not.toContain('insights')
  })

  it('reads the paragraph alone, with no insight of its own', () => {
    const parsed = prompt.parse({ summary: '  Ringkas.  ' })

    expect(parsed.success && parsed.data).toEqual({ summary: 'Ringkas.', insights: [] })
    expect(prompt.parse({ summary: '' }).success).toBe(false)
  })
})
