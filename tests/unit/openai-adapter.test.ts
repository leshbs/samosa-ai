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
function apiError(status: number, headers?: Record<string, string>, code?: string) {
  return Object.assign(new Error(`status ${status}`), { status, headers, code })
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
    expect(result.error.message).toContain('tidak bisa dibaca')
  })

  it('rejects output that parses but does not match the schema', async () => {
    create.mockResolvedValue(completion([{ index: 0, sentiment: 'senang' }]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('tidak sesuai format')
    // Which field broke and how, and that the reply — not the provider — is at
    // fault. Never the value: that is a respondent's words.
    expect(result.error.details?.malformedReply).toBe(true)
    expect(result.error.details?.issues).toBeGreaterThan(0)
    expect(JSON.stringify(result.error.details?.where)).toMatch(/: [a-z_]+/)
  })

  it('separates analysis.v2 no_content answers from the results', async () => {
    create.mockResolvedValue(
      completion([
        ITEM,
        // Anything the model adds to a no_content item is dropped.
        { index: 1, sentiment: 'no_content', summary: 'Tidak ada masukan.' },
        { ...ITEM, index: 2 },
      ]),
    )

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru', 'belum kepikiran', 'Band-nya keren'],
      promptVersion: 'analysis.v2',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items.map((item) => item.index)).toEqual([0, 2])
    expect(result.value.noContentIndexes).toEqual([1])
  })

  it('holds analysis.v1 to its own contract, which has no no_content', async () => {
    create.mockResolvedValue(completion([{ index: 0, sentiment: 'no_content' }]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['belum kepikiran'],
      promptVersion: 'analysis.v1',
    })

    expect(result.ok).toBe(false)
  })

  it('sends a batch with the prompt of its mode and the question it answers', async () => {
    create.mockResolvedValue(completion([{ index: 0, values: ['outbound'] }]))

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Outbond nya seru'],
      promptVersion: 'analysis.v3',
      mode: 'categorical',
      question: 'Kegiatan apa yang paling seru?',
      knownValues: ['api unggun'],
    })

    const messages = create.mock.calls[0]?.[0].messages as Array<{ content: string }>
    expect(messages[0]?.content).toContain('pilihan')
    expect(messages.at(-1)?.content).toContain('Kegiatan apa yang paling seru?')
    expect(messages.at(-1)?.content).toContain('["api unggun"]')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // No sentiment came back because none was asked for.
    expect(result.value.items).toEqual([
      {
        index: 0,
        sentiment: null,
        confidence: null,
        topics: ['outbound'],
        keywords: [],
        summary: '',
      },
    ])
  })

  it('marks a reply it could not read as the model\u2019s fault, so it can be asked again', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '{"items": [' } }] })

    const result = await createOpenAiAdapter(noWait).analyzeBatch({
      texts: ['Acaranya seru'],
      promptVersion: 'analysis.v3',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.details?.malformedReply).toBe(true)
  })

  it('guesses column modes from headers and shapes, never cells', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              columns: [
                { index: 0, mode: 'evaluative' },
                // Index 1 is left out: the caller fills it from the rules.
                { index: 2, mode: 'scale' },
              ],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 300, completion_tokens: 20 },
    })

    const result = await createOpenAiAdapter(noWait).classifyColumns({
      promptVersion: 'modes.v1',
      columns: [
        {
          header: 'Kritik dan saran',
          kind: 'long_text',
          filled: 110,
          distinct: 104,
          averageWords: 11.2,
        },
        {
          header: 'Paling seru?',
          kind: 'short_text',
          filled: 118,
          distinct: 14,
          averageWords: 1.8,
        },
        {
          header: 'Puas? (1-5)',
          kind: 'number',
          filled: 120,
          distinct: 5,
          averageWords: 1,
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.modes).toEqual(['evaluative', null, 'scale'])
    expect(result.value.costMicroIdr).toBeGreaterThan(0)

    const sent = (create.mock.calls[0]?.[0].messages as Array<{ content: string }>).at(-1)
    expect(sent?.content).toContain('Kritik dan saran')
    expect(sent?.content).toContain('isi="teks panjang"')
  })

  const reply = (
    body: unknown,
    usage = { prompt_tokens: 400, completion_tokens: 60 },
  ) => ({
    choices: [{ message: { content: JSON.stringify(body) } }],
    usage,
  })

  it('asks which topic labels might name one thing, sending the labels and the question', async () => {
    create.mockResolvedValue(reply({ groups: [['kualitas audio', 'kualitas sound']] }))

    const result = await createOpenAiAdapter(noWait).mergeTopics({
      promptVersion: 'merge.v1',
      question: 'Kritik dan saran',
      topics: ['kualitas audio', 'kualitas sound', 'dekorasi'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.groups).toEqual([['kualitas audio', 'kualitas sound']])
    expect(result.value.usage).toEqual({ inputTokens: 400, outputTokens: 60 })
    expect(result.value.costMicroIdr).toBeGreaterThan(0)

    const request = create.mock.calls[0]?.[0]
    expect(request.temperature).toBe(0)
    expect(request.response_format).toEqual({ type: 'json_object' })
    const messages = request.messages as Array<{ role: string; content: string }>
    // System, the example exchange, then the real list.
    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(messages.at(-1)?.content).toContain('- kualitas sound')
    expect(messages.at(-1)?.content).toContain('"Kritik dan saran"')
  })

  it('asks about each proposed pair on its own', async () => {
    create.mockResolvedValue(
      reply({
        pairs: [
          { a: 'kualitas audio', b: 'kualitas sound', same: true },
          { a: 'tanggung jawab', b: 'komitmen', same: false },
        ],
      }),
    )

    const result = await createOpenAiAdapter(noWait).confirmMerges({
      promptVersion: 'merge.v1',
      question: 'Kritik dan saran',
      pairs: [
        ['kualitas audio', 'kualitas sound'],
        ['tanggung jawab', 'komitmen'],
      ],
    })

    expect(result.ok && result.value.verdicts.map((verdict) => verdict.same)).toEqual([
      true,
      false,
    ])
    const sent = (create.mock.calls[0]?.[0].messages as Array<{ content: string }>).at(-1)
    expect(sent?.content).toContain('- "tanggung jawab" dan "komitmen"')
  })

  it.each([
    ['mergeTopics', { groups: 'kualitas audio' }],
    ['confirmMerges', { pairs: [{ a: 'x', b: 'y', same: 'ya' }] }],
  ] as const)(
    'marks a %s reply that broke its format as worth asking again',
    async (method, body) => {
      create.mockResolvedValue(reply(body))
      const adapter = createOpenAiAdapter(noWait)

      const result =
        method === 'mergeTopics'
          ? await adapter.mergeTopics({
              promptVersion: 'merge.v1',
              question: 'q',
              topics: [],
            })
          : await adapter.confirmMerges({
              promptVersion: 'merge.v1',
              question: 'q',
              pairs: [],
            })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.details).toMatchObject({ malformedReply: true })
    },
  )

  it('asks which topics make one theme, sending the labels and the question', async () => {
    create.mockResolvedValue(
      reply({
        themes: [{ name: 'Tata suara', topics: ['kualitas audio', 'teknis suara'] }],
      }),
    )

    const result = await createOpenAiAdapter(noWait).groupThemes({
      promptVersion: 'theme.v1',
      question: 'Kritik dan saran',
      topics: ['kualitas audio', 'teknis suara', 'dekorasi'],
    })

    expect(result.ok && result.value.themes).toEqual([
      { name: 'Tata suara', topics: ['kualitas audio', 'teknis suara'] },
    ])
    const messages = create.mock.calls[0]?.[0].messages as Array<{ content: string }>
    expect(messages.at(-1)?.content).toContain('- teknis suara')
    expect(messages.at(-1)?.content).toContain('"Kritik dan saran"')
  })

  it('asks for a finding per item, sending each item with its numbered quotes', async () => {
    create.mockResolvedValue(
      reply({
        insights: [
          {
            candidate: 1,
            title: 'Suara tidak jelas',
            detail: 'Detail.',
            evidence: [1, 2],
          },
        ],
      }),
    )

    const result = await createOpenAiAdapter(noWait).writeInsights({
      promptVersion: 'insight.v1',
      question: 'Kritik dan saran',
      mode: 'evaluative',
      answers: 40,
      candidates: [
        {
          number: 1,
          name: 'Tata suara',
          topics: [{ term: 'kualitas audio', count: 3 }],
          support: 3,
          sentimentCounts: { positive: 0, neutral: 0, negative: 3 },
          signal: 'topic',
          quotes: [
            { number: 1, text: 'Mic mati' },
            { number: 2, text: 'Suara pecah' },
          ],
        },
      ],
    })

    expect(result.ok && result.value.insights).toEqual([
      { candidate: 1, title: 'Suara tidak jelas', detail: 'Detail.', evidence: [1, 2] },
    ])
    const sent = (create.mock.calls[0]?.[0].messages as Array<{ content: string }>).at(-1)
    expect(sent?.content).toContain('Pokok 1: "Tata suara" — disebut di 3 jawaban')
    expect(sent?.content).toContain('[2] Suara pecah')
  })

  it.each([
    ['groupThemes', { themes: 'Tata suara' }],
    ['writeInsights', { insights: [{ candidate: 'satu', title: 't', detail: 'd' }] }],
  ] as const)(
    'marks a %s reply that broke its format as worth asking again',
    async (method, body) => {
      create.mockResolvedValue(reply(body))
      const adapter = createOpenAiAdapter(noWait)

      const result =
        method === 'groupThemes'
          ? await adapter.groupThemes({
              promptVersion: 'theme.v1',
              question: 'q',
              topics: ['a', 'b'],
            })
          : await adapter.writeInsights({
              promptVersion: 'insight.v1',
              question: 'q',
              mode: 'thematic',
              answers: 1,
              candidates: [],
            })

      expect(result.ok).toBe(false)
      expect(!result.ok && result.error.details).toMatchObject({ malformedReply: true })
    },
  )

  it('fails a theme or insight call the provider did not answer', async () => {
    create.mockRejectedValue(apiError(401))
    const adapter = createOpenAiAdapter(noWait)

    const themes = await adapter.groupThemes({
      promptVersion: 'theme.v1',
      question: 'q',
      topics: ['a', 'b'],
    })
    const insights = await adapter.writeInsights({
      promptVersion: 'insight.v1',
      question: 'q',
      mode: 'thematic',
      answers: 1,
      candidates: [],
    })

    expect(!themes.ok && themes.error.details?.malformedReply).toBeUndefined()
    expect(!insights.ok && insights.error.message).toBe(
      'Kunci API OpenAI di server ditolak',
    )
  })

  it('fails a merge call the provider did not answer, without the malformed mark', async () => {
    create.mockRejectedValue(apiError(401))

    const result = await createOpenAiAdapter(noWait).mergeTopics({
      promptVersion: 'merge.v1',
      question: 'q',
      topics: ['a', 'b'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('Kunci API OpenAI di server ditolak')
    expect(result.error.details?.malformedReply).toBeUndefined()
  })

  it('fails a merge call that came back empty or as something that is not JSON', async () => {
    const adapter = createOpenAiAdapter(noWait)
    const ask = () =>
      adapter.confirmMerges({ promptVersion: 'merge.v1', question: 'q', pairs: [] })

    create.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
    const empty = await ask()
    expect(!empty.ok && empty.error.message).toBe('Penyedia AI membalas tanpa isi')

    create.mockResolvedValueOnce({
      choices: [{ message: { content: 'maaf, tidak bisa' } }],
    })
    const prose = await ask()
    expect(!prose.ok && prose.error.details).toMatchObject({ malformedReply: true })
  })

  it('rejects an unknown prompt version instead of silently using another', async () => {
    await expect(
      createOpenAiAdapter(noWait).analyzeBatch({
        texts: ['Acaranya seru'],
        promptVersion: 'v99',
      }),
    ).rejects.toThrow('Unknown analysis prompt version')
  })

  describe('names why the provider refused', () => {
    const cases: Array<[string, unknown, string]> = [
      [
        'a rejected key',
        apiError(401, undefined, 'invalid_api_key'),
        'Kunci API OpenAI di server ditolak',
      ],
      [
        'an empty balance',
        apiError(429, undefined, 'insufficient_quota'),
        'Kuota atau saldo akun OpenAI habis',
      ],
      [
        'an unknown model',
        apiError(404, undefined, 'model_not_found'),
        'Model AI yang disetel di server tidak tersedia',
      ],
      [
        'a model name pasted with its quotes',
        Object.assign(new Error('400 invalid model ID'), { status: 400 }),
        'Nama model AI yang disetel di server tidak valid',
      ],
      [
        'a reasoning model that refuses max_tokens',
        apiError(400, undefined, 'unsupported_parameter'),
        'Model AI yang disetel di server tidak mendukung pengaturan analisis ini',
      ],
      [
        'anything else, by its status and code',
        apiError(400, undefined, 'invalid_request_error'),
        'Permintaan ke penyedia AI gagal (HTTP 400, invalid_request_error)',
      ],
      [
        'anything else without a code, by its status',
        apiError(422),
        'Permintaan ke penyedia AI gagal (HTTP 422)',
      ],
      [
        'an unreachable provider',
        Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }),
        'Server tidak bisa menghubungi penyedia AI',
      ],
    ]

    it.each(cases)('%s', async (_, failure, message) => {
      create.mockRejectedValue(failure)

      const result = await createOpenAiAdapter(noWait).analyzeBatch({
        texts: ['Acaranya seru'],
        promptVersion: 'analysis.v1',
      })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.message).toBe(message)
    })

    it('does not retry an empty balance, which will not refill in seconds', async () => {
      create.mockRejectedValue(apiError(429, undefined, 'insufficient_quota'))

      const result = await createOpenAiAdapter(noWait).analyzeBatch({
        texts: ['Acaranya seru'],
        promptVersion: 'analysis.v1',
      })

      expect(create).toHaveBeenCalledTimes(1)
      expect(result.ok || result.error.details).toEqual({
        status: 429,
        providerCode: 'insufficient_quota',
      })
    })
  })
})
