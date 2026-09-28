import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '@/modules/shared'
import type { LlmAdapter, SummaryInput } from '@/modules/analysis/adapters/types'

const upsert = vi.fn()
const select = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'reports') return { upsert }
      const chain = {
        select: (...args: unknown[]) => {
          select(...args)
          return chain
        },
        eq: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve(rowsFromDb),
      }
      return chain
    },
  }),
}))

const { generateReportSummary, selectQuotes } =
  await import('@/modules/reporting/services/summary-generator')

type DbRow = {
  response_id: string
  sentiment: string
  topics: string[]
  keywords: string[]
  responses: { text: string }
}

let rowsFromDb: { data: DbRow[] | null; error: null }

function row(id: string, sentiment: string, topics: string[], text: string): DbRow {
  return { response_id: id, sentiment, topics, keywords: [], responses: { text } }
}

/** Captures what the adapter was handed so the prompt input can be asserted. */
function stubAdapter(insights: Array<{ evidence: number[] }>): {
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
        })),
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
  rowsFromDb = {
    data: [
      row('r1', 'negative', ['kantin'], 'Kantin antre panjang sekali.'),
      row('r2', 'positive', ['kantin'], 'Kantin sekarang lebih bersih.'),
      row('r3', 'neutral', ['parkir'], 'Parkir motor penuh jam 7.'),
    ],
    error: null,
  }
})

describe('generateReportSummary', () => {
  it('maps cited quote positions back to response ids', async () => {
    const { adapter, seen } = stubAdapter([{ evidence: [1] }, { evidence: [3] }])

    const result = await generateReportSummary({
      organizationId: 'org-1',
      jobId: 'job-1',
      adapter,
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
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // A hallucinated citation loses its quote rather than pointing at a
    // response the model never saw.
    expect(result.value.insights[0]?.evidenceResponseIds).toEqual([])
  })

  it('stores the narrative against the job so it is not regenerated per view', async () => {
    const { adapter } = stubAdapter([{ evidence: [] }])

    await generateReportSummary({ organizationId: 'org-1', jobId: 'job-1', adapter })

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
