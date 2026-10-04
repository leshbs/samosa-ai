import { describe, expect, it, vi } from 'vitest'
import { analyzeResponses } from '@/modules/analysis/services/orchestrator'
import { planBatches } from '@/modules/analysis/services/batcher'
import { isNonAnswer, normalizeAnswer } from '@/modules/analysis/services/no-content'
import { separatesNoContent } from '@/modules/analysis'
import { ok } from '@/modules/shared'
import type { LlmAdapter } from '@/modules/analysis/adapters/types'

describe('normalizeAnswer', () => {
  it('lowercases, turns punctuation into spaces, and collapses whitespace', () => {
    expect(normalizeAnswer('  Tidak   ADA...  ')).toBe('tidak ada')
    expect(normalizeAnswer('tidak-ada!!')).toBe('tidak ada')
    expect(normalizeAnswer('N/A')).toBe('n a')
  })

  it('reduces punctuation-only answers to nothing', () => {
    for (const text of ['-', '–', '.', '...', '?!'])
      expect(normalizeAnswer(text)).toBe('')
  })
})

describe('isNonAnswer', () => {
  it('catches every phrase on the pilot 01 list, however it is typed', () => {
    const listed = [
      'tidak ada',
      'tdk ada',
      'ga ada',
      'gaada',
      'gada',
      'nggak ada',
      'engga ada',
      'belum ada',
      'tidak',
      'ga',
      'nihil',
      'none',
      'no',
      '-',
      '–',
      '.',
      '...',
    ]
    for (const text of listed) expect(isNonAnswer(text), text).toBe(true)
    expect(isNonAnswer('Tidak ada.')).toBe(true)
    expect(isNonAnswer('TIDAK ADA!!!')).toBe(true)
    expect(isNonAnswer('N/A')).toBe(true)
  })

  it('leaves short praise alone: those are positive feedback, not silence', () => {
    for (const text of ['aman', 'sudah bagus', 'semua baik', 'cukup', 'sudah oke']) {
      expect(isNonAnswer(text), text).toBe(false)
    }
  })

  it('matches whole answers only, so feedback that starts with "tidak ada" survives', () => {
    expect(isNonAnswer('tidak ada masalah, sudah bagus')).toBe(false)
    expect(isNonAnswer('tidak ada sound system yang jelas')).toBe(false)
    expect(isNonAnswer('belum ada jadwal pasti')).toBe(false)
  })

  it('lets go of a final letter held down', () => {
    // On the pilot data analysis.v3 called the first of these `negative`.
    for (const text of ['Tidak adaa', 'tidakkk adaaa', 'gaaa', 'nooo', 'ga adaa.']) {
      expect(isNonAnswer(text), text).toBe(true)
    }
    // Only at the end of a word: "gaada" keeps its double letter and still
    // matches, and a doubled letter inside a word is not touched.
    expect(isNonAnswer('gaada')).toBe(true)
    expect(isNonAnswer('saat')).toBe(false)
  })

  it('looks past a lead-in or a closing particle around a non-answer', () => {
    const softened = [
      'Sejauh ini tidak ada',
      'Jujur, tidak ada',
      'Tidak ada sih',
      'untuk saat ini belum ada',
      'sementara ini ga ada kak',
      'mungkin tidak ada ya hehe',
      'kayaknya gaada deh',
    ]
    for (const text of softened) expect(isNonAnswer(text), text).toBe(true)
  })

  it('still leaves anything with content after the softening to the model', () => {
    const kept = [
      'sejauh ini sudah bagus',
      'tidak ada sih, cuma AC-nya panas',
      'jujur kurang seru',
      'tidak ada, terima kasih panitia',
      'sejauh ini aman',
      // The softening words alone are not a non-answer either.
      'sih',
      'mungkin',
      'sejauh ini',
    ]
    for (const text of kept) expect(isNonAnswer(text), text).toBe(false)
  })

  it('does not apply the softening where "tidak" is itself an answer', () => {
    expect(isNonAnswer('tidak sih', 'categorical')).toBe(false)
    expect(isNonAnswer('tidak adaa', 'categorical')).toBe(false)
  })
})

describe('planBatches with non-answers', () => {
  it('keeps them away from the model, alongside empty responses', () => {
    const plan = planBatches([
      { id: 'real', text: 'Konsumsi telat dua jam' },
      { id: 'none', text: 'Tidak ada.' },
      { id: 'dash', text: '-' },
      { id: 'praise', text: 'aman' },
    ])

    expect(plan.skippedIds).toEqual(['none', 'dash'])
    expect(plan.batches[0]?.items.map((item) => item.id)).toEqual(['real', 'praise'])
  })
})

function adapterAnswering(noContentIndexes: (texts: string[]) => number[]): LlmAdapter {
  return {
    name: 'stub',
    summarize: vi.fn(),
    classifyColumns: vi.fn(),
    analyzeBatch: vi.fn(async ({ texts }: { texts: string[] }) => {
      const empty = new Set(noContentIndexes(texts))
      return ok({
        items: texts.flatMap((_, index) =>
          empty.has(index)
            ? []
            : [
                {
                  index,
                  sentiment: 'neutral' as const,
                  confidence: 0.8,
                  topics: ['acara'],
                  keywords: [],
                  summary: 'ringkasan',
                },
              ],
        ),
        noContentIndexes: [...empty],
        modelId: 'stub-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        costMicroIdr: 1,
      })
    }),
  }
}

describe('analyzeResponses with non-answers', () => {
  it('counts both layers and gives neither a result', async () => {
    const adapter = adapterAnswering((texts) =>
      texts.flatMap((text, index) => (text.startsWith('belum kepikiran') ? [index] : [])),
    )

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v2',
      responses: [
        { id: 'a', text: 'Kursinya kurang banyak' },
        { id: 'b', text: 'tidak ada' },
        { id: 'c', text: 'belum kepikiran apa-apa kak' },
        { id: 'd', text: 'Acaranya seru' },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.results.map((r) => r.responseId)).toEqual(['a', 'd'])
    expect(result.value.noContentResponseIds.sort()).toEqual(['b', 'c'])
    expect(result.value.failedResponseIds).toEqual([])
  })

  it('says there was nothing to analyse when every answer was empty, not that the model failed', async () => {
    const adapter = adapterAnswering((texts) => texts.map((_, index) => index))

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v2',
      responses: [
        { id: 'a', text: 'belum kepikiran' },
        { id: 'b', text: 'gak tau mau nulis apa' },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
    expect(result.error.message).toContain('tidak ada')
  })
})

describe('separatesNoContent', () => {
  it('is false for jobs whose prompt could only call silence "neutral"', () => {
    expect(separatesNoContent('v1')).toBe(false)
    expect(separatesNoContent('analysis.v1')).toBe(false)
  })

  it('is true from analysis.v2 on, and false for anything unknown', () => {
    expect(separatesNoContent('analysis.v2')).toBe(true)
    expect(separatesNoContent('analysis.v9')).toBe(false)
  })
})
