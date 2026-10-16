import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_CODES, appError, err, ok } from '@/modules/shared'
import type {
  InsightInput,
  LlmAdapter,
  SummaryInput,
} from '@/modules/analysis/adapters/types'
import { DEFAULT_SUMMARY_VERSION } from '@/modules/analysis/prompts'

const upsert = vi.fn()
const select = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'reports') return { upsert }
      const chain = {
        select: (...args: unknown[]) => {
          if (table === 'analysis_results') select(...args)
          return chain
        },
        eq: () => chain,
        // The read is paged; one short page is the whole result.
        order: () => chain,
        range: () => chain,
        maybeSingle: async () => ({ data: jobFromDb }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve(table === 'dataset_questions' ? { data: questionsFromDb } : rowsFromDb),
      }
      return chain
    },
  }),
}))

const { generateReportSummary, selectQuotes } =
  await import('@/modules/reporting/services/summary-generator')

type DbRow = {
  response_id: string
  sentiment: string | null
  topics: string[]
  keywords: string[]
  responses: { text: string; question_id?: string }
}

let rowsFromDb: { data: DbRow[] | null; error: null }
/** The job row and its questions; null and empty for a job from before either. */
let jobFromDb: Record<string, unknown> | null
let questionsFromDb: Array<{ id: string; question_text: string; position: number }>

function row(
  id: string,
  sentiment: string | null,
  topics: string[],
  text: string,
  questionId?: string,
): DbRow {
  return {
    response_id: id,
    sentiment,
    topics,
    keywords: [],
    responses: { text, question_id: questionId },
  }
}

/** Captures what the adapter was handed so the prompt input can be asserted. */
function stubAdapter(
  insights: Array<{ evidence: number[]; question?: number | null }>,
  citesQuestions = false,
): {
  adapter: LlmAdapter
  seen: SummaryInput[]
} {
  const seen: SummaryInput[] = []
  const adapter = {
    name: 'stub',
    analyzeBatch: vi.fn(),
    summarize: vi.fn(async (input: SummaryInput) => {
      seen.push(input)
      return ok({
        summary: 'ringkasan',
        insights: insights.map((insight, index) => ({
          title: `insight ${index}`,
          detail: 'detail',
          evidence: insight.evidence,
          question: insight.question ?? null,
        })),
        citesQuestions,
        modelId: 'stub-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        costMicroIdr: 42,
      })
    }),
  } as unknown as LlmAdapter

  return { adapter, seen }
}

beforeEach(() => {
  upsert.mockReset()
  upsert.mockResolvedValue({ error: null })
  select.mockReset()
  jobFromDb = null
  questionsFromDb = []
  rowsFromDb = {
    data: [
      row('r1', 'negative', ['kantin'], 'Kantin antre panjang sekali.'),
      row('r2', 'positive', ['kantin'], 'Kantin sekarang lebih bersih.'),
      row('r3', 'neutral', ['parkir'], 'Parkir motor penuh jam 7.'),
    ],
    error: null,
  }
})

/** The tests below are of summary.v3, whose call writes the insights too. */
const V3 = { promptVersion: 'summary.v3' }

describe('generateReportSummary', () => {
  it('maps cited quote positions back to response ids', async () => {
    const { adapter, seen } = stubAdapter([{ evidence: [1] }, { evidence: [3] }])

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(result.ok).toBe(true)
    const quotes = seen[0]?.data.sampleQuotes ?? []
    // Position 1 and 3 in the list the model actually saw.
    const expected = [quotes[0], quotes[2]]
    const texts = rowsFromDb.data?.map((r) => r.responses.text) ?? []
    expect(expected.every((quote) => texts.includes(String(quote)))).toBe(true)

    if (!result.ok) return
    expect(result.value.insights[0]?.evidenceResponseIds).toHaveLength(1)
    expect(result.value.insights[1]?.evidenceResponseIds).toHaveLength(1)
  })

  it('drops citations that point past the quotes the model was given', async () => {
    const { adapter } = stubAdapter([{ evidence: [99] }])

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // A hallucinated citation loses its quote rather than pointing at a
    // response the model never saw.
    expect(result.value.insights[0]?.evidenceResponseIds).toEqual([])
  })

  it('stores the narrative against the job so it is not regenerated per view', async () => {
    const { adapter } = stubAdapter([{ evidence: [] }])

    await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 'job-1', organization_id: 'org-1' }),
      { onConflict: 'job_id' },
    )
  })

  it('fails loudly when the job has no results to summarize', async () => {
    rowsFromDb = { data: [], error: null }
    const { adapter } = stubAdapter([{ evidence: [] }])

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(result.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  /** The adapter's account of a reply that broke the output format. */
  const malformed = () =>
    err(
      appError(
        ERROR_CODES.UPSTREAM,
        'Balasan model tidak sesuai format yang diharapkan',
        {
          details: {
            malformedReply: true,
            issues: 1,
            where: ['insights.0.title: too_big'],
          },
        },
      ),
    )

  it('asks once more when the model\u2019s reply broke the format', async () => {
    const { adapter } = stubAdapter([{ evidence: [1] }])
    const summarize = vi.mocked(adapter.summarize)
    const good = summarize.getMockImplementation()
    summarize.mockImplementationOnce(async () => malformed())

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    // The second reply is the one stored; the reader never sees the first.
    expect(result.ok).toBe(true)
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(summarize.mock.calls[1]?.[0]).toEqual(summarize.mock.calls[0]?.[0])
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(good).toBeDefined()
  })

  it('gives up after the second malformed reply rather than asking forever', async () => {
    const { adapter } = stubAdapter([{ evidence: [] }])
    const summarize = vi.mocked(adapter.summarize)
    summarize.mockImplementation(async () => malformed())

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(result.ok).toBe(false)
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('does not ask again when the provider itself was unreachable', async () => {
    const { adapter } = stubAdapter([{ evidence: [] }])
    const summarize = vi.mocked(adapter.summarize)
    // Already retried inside the adapter; a second round only holds the job open.
    summarize.mockImplementation(async () =>
      err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI tidak merespons')),
    )

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(result.ok).toBe(false)
    expect(summarize).toHaveBeenCalledTimes(1)
  })

  it('writes from one pool when the job has no questions on record', async () => {
    const { adapter, seen } = stubAdapter([{ evidence: [1] }])

    await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
      ...V3,
    })

    expect(seen[0]?.data.questions).toEqual([
      expect.objectContaining({ text: 'Aspirasi', mode: 'evaluative', answers: 3 }),
    ])
  })

  describe('with questions of different kinds', () => {
    beforeEach(() => {
      jobFromDb = {
        dataset_id: 'dataset-1',
        prompt_version: 'analysis.v3',
        no_content_count: 6,
        question_counts: {
          q1: { analyzed: 2, no_content: 5, failed: 0, mode: 'evaluative' },
          q2: { analyzed: 3, no_content: 1, failed: 0, mode: 'categorical' },
          q3: { analyzed: 3, no_content: 0, failed: 0, mode: 'scale' },
        },
      }
      questionsFromDb = [
        { id: 'q1', question_text: 'Kritik dan saran', position: 0 },
        { id: 'q2', question_text: 'Kegiatan paling seru?', position: 1 },
        { id: 'q3', question_text: 'Seberapa puas? (1-5)', position: 2 },
      ]
      rowsFromDb = {
        data: [
          row('r1', 'negative', ['kantin'], 'Kantin antre panjang sekali.', 'q1'),
          row('r2', 'positive', ['kantin'], 'Kantin sekarang lebih bersih.', 'q1'),
          row('c1', null, ['outbound'], 'Outbond', 'q2'),
          row('c2', null, ['outbound'], 'outbound!!', 'q2'),
          row('c3', null, ['api unggun'], 'api unggun', 'q2'),
          row('s1', null, ['4'], '4', 'q3'),
          row('s2', null, ['4'], '4/5', 'q3'),
          row('s3', null, ['5'], '5', 'q3'),
        ],
        error: null,
      }
    })

    it('counts topics as the report does: through the merges the job recorded', async () => {
      jobFromDb = {
        ...jobFromDb,
        topic_merges: {
          prompt_version: 'merge.v1',
          questions: {
            q1: { kantin: 'makanan kantin' },
            q2: { 'api unggun': 'outbound' },
          },
        },
      }
      rowsFromDb.data?.push(
        row('r3', 'negative', ['makanan kantin'], 'Makanannya dingin.', 'q1'),
      )
      const { adapter, seen } = stubAdapter([{ evidence: [] }], true)

      await generateReportSummary({
        organizationId: 'org-1',
        jobId: 'job-1',
        adapter,
        ...V3,
      })

      const [kritik, pilihan] = seen[0]?.data.questions ?? []
      // Two labels, one topic, three answers: the number the chart shows.
      expect(kritik?.top).toEqual([{ term: 'makanan kantin', count: 3 }])
      expect(pilihan?.top).toEqual([{ term: 'outbound', count: 3 }])
    })

    it('hands the model each question as the report draws it', async () => {
      const { adapter, seen } = stubAdapter([{ evidence: [] }], true)

      await generateReportSummary({
        organizationId: 'org-1',
        jobId: 'job-1',
        adapter,
        ...V3,
      })

      const [kritik, pilihan, nilai] = seen[0]?.data.questions ?? []
      expect(kritik).toMatchObject({
        text: 'Kritik dan saran',
        mode: 'evaluative',
        answers: 2,
        noContent: 5,
        sentimentCounts: { positive: 1, neutral: 0, negative: 1 },
        top: [{ term: 'kantin', count: 2 }],
      })
      // No sentiment is offered for a question that has none to offer.
      expect(pilihan).toMatchObject({
        mode: 'categorical',
        answers: 3,
        top: [
          { term: 'outbound', count: 2 },
          { term: 'api unggun', count: 1 },
        ],
      })
      expect(pilihan).not.toHaveProperty('sentimentCounts')
      expect(nilai).toMatchObject({
        mode: 'scale',
        answers: 3,
        scale: { mostCommon: '4' },
        top: [
          { term: '4', count: 2 },
          { term: '5', count: 1 },
        ],
      })
      expect(nilai?.scale?.mean).toBeCloseTo(13 / 3)
    })

    it('quotes only prose, and says which question each quote answers', async () => {
      const { adapter, seen } = stubAdapter([{ evidence: [] }], true)

      await generateReportSummary({
        organizationId: 'org-1',
        jobId: 'job-1',
        adapter,
        ...V3,
      })

      // A choice or a number is already its own count; quoting "4" adds nothing.
      expect(seen[0]?.data.sampleQuotes).toEqual([
        'Kantin antre panjang sekali.',
        'Kantin sekarang lebih bersih.',
      ])
      expect(seen[0]?.data.quoteQuestions).toEqual([1, 1])
      // The pooled sentiment the older prompts read counts the judged rows only.
      expect(seen[0]?.data.sentimentCounts).toEqual({
        positive: 1,
        neutral: 0,
        negative: 1,
      })
    })

    it('records the question each insight comes from', async () => {
      const { adapter } = stubAdapter(
        [
          { evidence: [1], question: 1 },
          { evidence: [], question: 2 },
          // 0 and a number past the last question both mean "several".
          { evidence: [], question: 0 },
          { evidence: [], question: 9 },
        ],
        true,
      )

      const result = await generateReportSummary({
        organizationId: 'org-1',
        jobId: 'job-1',
        adapter,
        ...V3,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.insights.map((insight) => insight.questionId)).toEqual([
        'q1',
        'q2',
        null,
        null,
      ])
      expect(result.value.insights[0]?.evidenceResponseIds).toEqual(['r1'])
    })

    it('leaves the origin out when the prompt never asked for one', async () => {
      const { adapter } = stubAdapter([{ evidence: [1] }], false)

      const result = await generateReportSummary({
        organizationId: 'org-1',
        jobId: 'job-1',
        adapter,
        promptVersion: 'summary.v2',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Absent, not null: the page tells a pooled summary by this.
      expect(result.value.insights[0]).not.toHaveProperty('questionId')
    })
  })
})

/** summary.v4: the paragraph in one call, the findings of each prose question apart. */
function v4Adapter(): LlmAdapter {
  const spent = { modelId: 'stub-model', usage: { inputTokens: 1, outputTokens: 1 } }
  return {
    name: 'stub',
    analyzeBatch: vi.fn(),
    classifyColumns: vi.fn(),
    mergeTopics: vi.fn(),
    confirmMerges: vi.fn(),
    summarize: vi.fn(async () =>
      ok({
        summary: 'ringkasan',
        insights: [],
        citesQuestions: true,
        ...spent,
        costMicroIdr: 100,
      }),
    ),
    groupThemes: vi.fn(async () => ok({ themes: [], ...spent, costMicroIdr: 10 })),
    writeInsights: vi.fn(async (input: InsightInput) =>
      ok({
        insights: input.candidates.map((candidate) => ({
          candidate: candidate.number,
          title: `Temuan ${candidate.name}`,
          detail: 'detail',
          evidence: candidate.quotes.map((quote) => quote.number),
        })),
        ...spent,
        costMicroIdr: 20,
      }),
    ),
  }
}

describe('generateReportSummary on summary.v4', () => {
  beforeEach(() => {
    jobFromDb = {
      dataset_id: 'dataset-1',
      prompt_version: 'analysis.v3',
      question_counts: {
        q1: { analyzed: 3, no_content: 0, failed: 0, mode: 'evaluative' },
        q2: { analyzed: 3, no_content: 0, failed: 0, mode: 'thematic' },
        q3: { analyzed: 2, no_content: 0, failed: 0, mode: 'categorical' },
      },
    }
    questionsFromDb = [
      { id: 'q1', question_text: 'Kritik dan saran', position: 0 },
      { id: 'q2', question_text: 'Nilai yang dipelajari', position: 1 },
      { id: 'q3', question_text: 'Kegiatan paling seru?', position: 2 },
    ]
    rowsFromDb = {
      data: [
        row('r1', 'negative', ['kantin'], 'Kantin antre panjang sekali.', 'q1'),
        row('r2', 'positive', ['kantin'], 'Kantin sekarang lebih bersih.', 'q1'),
        row('r3', 'negative', ['parkir'], 'Parkir motor penuh jam tujuh.', 'q1'),
        row('t1', null, ['keberanian'], 'Aku jadi berani tampil di depan.', 'q2'),
        row('t2', null, ['keberanian'], 'Berani mencoba hal yang baru.', 'q2'),
        row('t3', null, ['keberanian'], 'Tidak takut salah lagi sekarang.', 'q2'),
        row('c1', null, ['outbound'], 'Outbound', 'q3'),
        row('c2', null, ['outbound'], 'outbound', 'q3'),
      ],
      error: null,
    }
  })

  it('is what a new report is written with', () => {
    expect(DEFAULT_SUMMARY_VERSION).toBe('summary.v4')
  })

  it('writes the paragraph from the figures alone, and the findings of prose apart', async () => {
    const adapter = v4Adapter()

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
    })

    expect(result.ok).toBe(true)
    // The quotes now sit under the findings that cite them.
    expect(vi.mocked(adapter.summarize).mock.calls[0]?.[0].data.sampleQuotes).toEqual([])
    // Themes for the critique only; a finding for each prose question; none
    // for a choice, which is its own count.
    expect(adapter.groupThemes).toHaveBeenCalledTimes(1)
    const written = vi.mocked(adapter.writeInsights).mock.calls.map(([input]) => input)
    // Side by side, so in no fixed order.
    expect(written.map((input) => [input.question, input.mode]).sort()).toEqual([
      ['Kritik dan saran', 'evaluative'],
      ['Nilai yang dipelajari', 'thematic'],
    ])
  })

  it('stores the findings most supported first, each with what it stands on', async () => {
    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter: v4Adapter(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.insights).toEqual([
      expect.objectContaining({
        title: 'Temuan keberanian',
        questionId: 'q2',
        support: 3,
        topics: ['keberanian'],
        signal: 'topic',
      }),
      expect.objectContaining({
        title: 'Temuan kantin',
        questionId: 'q1',
        support: 2,
        signal: 'split',
        evidenceResponseIds: ['r1', 'r2'],
      }),
    ])
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'ringkasan', insights: result.value.insights }),
      { onConflict: 'job_id' },
    )
    // The paragraph, one theme call, two writing calls.
    expect(result.value.costMicroIdr).toBe(100 + 10 + 20 + 20)
  })

  it('keeps the summary when a question’s findings could not be written', async () => {
    const adapter = v4Adapter()
    vi.mocked(adapter.writeInsights).mockResolvedValue(
      err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI tidak merespons')),
    )

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
    })

    expect(result.ok && result.value.insights).toEqual([])
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('fails without the paragraph, whatever the findings did', async () => {
    const adapter = v4Adapter()
    vi.mocked(adapter.summarize).mockResolvedValue(
      err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI tidak merespons')),
    )

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
    })

    expect(result.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('selectQuotes', () => {
  it('leads with the complaints in each topic', () => {
    const quotes = selectQuotes([
      {
        responseId: 'r2',
        text: 'positif',
        sentiment: 'positive',
        topics: ['kantin'],
        keywords: [],
      },
      {
        responseId: 'r1',
        text: 'negatif',
        sentiment: 'negative',
        topics: ['kantin'],
        keywords: [],
      },
    ])

    // r1 is second in input order but first out: a report that quotes only
    // praise is the one nobody trusts.
    expect(quotes[0]?.responseId).toBe('r1')
  })

  it('spreads across topics instead of taking the first rows of the upload', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      responseId: `a${index}`,
      text: `aspirasi kantin ${index}`,
      sentiment: 'neutral' as const,
      topics: ['kantin'],
      keywords: [],
    }))
    const rare = {
      responseId: 'z1',
      text: 'parkir penuh',
      sentiment: 'negative' as const,
      topics: ['parkir'],
      keywords: [],
    }

    const quotes = selectQuotes([...many, rare])

    expect(quotes.map((quote) => quote.responseId)).toContain('z1')
  })
})
