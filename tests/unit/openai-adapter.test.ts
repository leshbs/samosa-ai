// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn()

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
  },
}))

const { createOpenAiAdapter } = await import('@/modules/analysis/adapters/openai')

/** Mirrors the shape of an OpenAI SDK error: a status plus optional headers. */
function apiError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`status ${status}`), { status, headers })
}

function completion(
  items: unknown,
  usage = { prompt_tokens: 100, completion_tokens: 50 },
) {
  return {
    choices: [{ message: { content: JSON.stringify({ items }) } }],
    usage,
  }
}

const ITEM = {
  index: 0,
  sentiment: 'positive',
  confidence: 0.9,
  topics: ['acara'],
  keywords: ['seru'],
  summary: 'Peserta menilai acara seru.',
}

/** No real waiting: the adapter takes its sleep and jitter as seams. */
const noWait = { sleep: async () => {}, random: () => 1 }

beforeEach(() => {
  create.mockReset()
})

describe('createOpenAiAdapter', () => {
  it('parses a well-formed batch and reports usage', async () => {
    create.mockResolvedValue(completion([ITEM]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items).toHaveLength(1)
    expect(result.value.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(result.value.costMicroIdr).toBeGreaterThan(0)
  })

  it('sends the few-shot exchange ahead of the real batch', async () => {
    create.mockResolvedValue(completion([ITEM]))

    await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    const messages = create.mock.calls[0]?.[0].messages as Array<{ role: string }>
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
    expect(messages[2]?.role).toBe('assistant')
    // The real batch is last, so the examples read as prior turns.
    expect(messages).toHaveLength(4)
  })

  it('strips a code fence the model was told not to emit', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n' + JSON.stringify({ items: [ITEM] }) + '\n```',
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(true)
  })

  it('retries a 429 and succeeds on a later attempt', async () => {
    create
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValue(completion([ITEM]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('retries a 500 as a transient server fault', async () => {
    create.mockRejectedValueOnce(apiError(503)).mockResolvedValue(completion([ITEM]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('gives up after three attempts rather than retrying forever', async () => {
    create.mockRejectedValue(apiError(429))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UPSTREAM')
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('does not retry a 400 — that is our bug, and retrying burns budget', async () => {
    create.mockRejectedValue(apiError(400))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 401, so a revoked key fails fast', async () => {
    create.mockRejectedValue(apiError(401))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('waits for the provider-supplied retry-after instead of its own backoff', async () => {
    const slept: number[] = []
    create
      .mockRejectedValueOnce(apiError(429, { 'retry-after': '2' }))
      .mockResolvedValue(completion([ITEM]))

    await createOpenAiAdapter({
      sleep: async (ms) => {
        slept.push(ms)
      },
      random: () => 1,
    }).analyzeBatch({ texts: ['Acaranya seru'], promptVersion: 'analysis.v1' })

    expect(slept).toEqual([2000])
  })

  it('reports invalid JSON as an upstream failure, not a crash', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('not valid JSON')
  })

  it('rejects output that parses but does not match the schema', async () => {
    create.mockResolvedValue(completion([{ index: 0, sentiment: 'senang' }]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('did not match')
  })

  it('rejects an unknown prompt version instead of silently using another', async () => {
    await expect(
      createOpenAiAdapter(noWait).analyzeBatch({
        texts: ['Acaranya seru'],
        promptVersion: 'v99',
      }),
    ).rejects.toThrow('Unknown analysis prompt version')
  })
})
