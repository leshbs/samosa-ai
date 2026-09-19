import { describe, expect, it, vi } from 'vitest'
import {
  analyzeResponses,
  BATCH_SIZE,
  chunk,
} from '@/modules/analysis/services/orchestrator'
import { ok, err, ERROR_CODES, appError } from '@/modules/shared'
import type { LlmAdapter } from '@/modules/analysis/adapters/types'

function makeResponses(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, text: `aspirasi ${i}` }))
}

function stubAdapter(overrides: Partial<LlmAdapter> = {}): LlmAdapter {
  return {
    name: 'stub',
    analyzeBatch: vi.fn(async ({ texts }) =>
      ok({
        items: texts.map((_: string, index: number) => ({
          index,
          sentiment: 'positive' as const,
          confidence: 0.9,
          topics: ['acara'],
          keywords: ['seru'],
          summary: 'ringkasan',
        })),
        modelId: 'stub-model',
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    ),
    ...overrides,
  }
}

describe('chunk', () => {
  it('splits items into fixed-size groups with a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('rejects a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow('chunk size must be positive')
  })
})

describe('analyzeResponses', () => {
  it('maps every batch item back to its response id', async () => {
    const adapter = stubAdapter()
    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'v1',
      responses: makeResponses(5),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.results).toHaveLength(5)
    expect(result.value.results.map((r) => r.responseId)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
      'r4',
    ])
  })

  it('splits work into batches of BATCH_SIZE', async () => {
    const adapter = stubAdapter()
    await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'v1',
      responses: makeResponses(BATCH_SIZE * 2 + 1),
    })

    expect(adapter.analyzeBatch).toHaveBeenCalledTimes(3)
  })

  it('rejects an empty dataset', async () => {
    const result = await analyzeResponses(stubAdapter(), {
      jobId: 'job-1',
      promptVersion: 'v1',
      responses: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.VALIDATION)
  })

  it('reports the responses of a failed batch instead of losing the job', async () => {
    let call = 0
    const adapter = stubAdapter({
      analyzeBatch: vi.fn(async ({ texts }) => {
        call += 1
        if (call === 1) return err(appError(ERROR_CODES.UPSTREAM, 'boom'))
        return ok({
          items: texts.map((_: string, index: number) => ({
            index,
            sentiment: 'neutral' as const,
            confidence: 0.5,
            topics: [],
            keywords: [],
            summary: '',
          })),
          modelId: 'stub-model',
          usage: { inputTokens: 1, outputTokens: 1 },
        })
      }),
    })

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'v1',
      responses: makeResponses(BATCH_SIZE + 2),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.failedResponseIds).toHaveLength(BATCH_SIZE)
    expect(result.value.results).toHaveLength(2)
  })

  it('fails when every batch fails', async () => {
    const adapter = stubAdapter({
      analyzeBatch: vi.fn(async () => err(appError(ERROR_CODES.UPSTREAM, 'boom'))),
    })

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'v1',
      responses: makeResponses(3),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.UPSTREAM)
  })
})
