import { describe, expect, it, vi } from 'vitest'
import type {
  BatchInput,
  BatchOutput,
  LlmAdapter,
} from '@/modules/analysis/adapters/types'
import {
  DEFAULT_PROMPT_VERSION,
  analysisPrompt,
  effectiveMode,
  separatesNoContent,
} from '@/modules/analysis/prompts'
import { BATCH_SIZE, planBatches } from '@/modules/analysis/services/batcher'
import { isNonAnswer } from '@/modules/analysis/services/no-content'
import { analyzeResponses } from '@/modules/analysis/services/orchestrator'
import { scaleValue } from '@/modules/analysis/services/scale'
import { ERROR_CODES, appError, err, ok } from '@/modules/shared'
import type { AppError, Result } from '@/modules/shared'

const QUESTION = 'Kegiatan apa yang paling seru?'

describe('analysis.v3 prompts', () => {
  it('is what a new job runs on, and still separates non-answers', () => {
    expect(DEFAULT_PROMPT_VERSION).toBe('analysis.v3')
    expect(separatesNoContent('analysis.v3')).toBe(true)
  })

  it('tells every mode what the respondent was asked', () => {
    for (const mode of ['evaluative', 'thematic', 'categorical'] as const) {
      const text = analysisPrompt('analysis.v3', mode).USER_TEMPLATE(['outbound'], {
        question: QUESTION,
      })
      expect(text).toContain(`<pertanyaan>\n${QUESTION}\n</pertanyaan>`)
      expect(text).toContain('<jawaban index="0">\noutbound\n</jawaban>')
    }
  })

  it('leaves the versions before it exactly as they were', () => {
    const v2 = analysisPrompt('analysis.v2', 'categorical')

    // One prompt whatever the mode, and no question in it.
    expect(v2.SYSTEM).toBe(analysisPrompt('analysis.v2').SYSTEM)
    expect(v2.USER_TEMPLATE(['aman'], { question: QUESTION })).toBe(
      v2.USER_TEMPLATE(['aman']),
    )
    expect(v2.USER_TEMPLATE(['aman'])).not.toContain(QUESTION)
  })

  it('reads every question as evaluative on a version from before modes', () => {
    expect(effectiveMode('analysis.v2', 'categorical')).toBe('evaluative')
    expect(effectiveMode('analysis.v1', 'scale')).toBe('evaluative')
    expect(effectiveMode('analysis.v3', 'categorical')).toBe('categorical')
  })

  it('asks a thematic question for no sentiment, and stores none', () => {
    const prompt = analysisPrompt('analysis.v3', 'thematic')
    expect(prompt.SYSTEM).toContain('JANGAN menilai sentimen')

    const parsed = prompt.OUTPUT_SCHEMA.parse({
      items: [
        // A model that adds a sentiment anyway: the field is not kept.
        {
          index: 0,
          sentiment: 'positive',
          confidence: 0.9,
          topics: ['kerja sama tim'],
          keywords: ['kerja sama'],
          summary: 'Belajar kerja sama.',
        },
        { index: 1, no_content: true },
      ],
    })

    expect(parsed.items).toEqual([
      {
        index: 0,
        sentiment: null,
        confidence: null,
        topics: ['kerja sama tim'],
        keywords: ['kerja sama'],
        summary: 'Belajar kerja sama.',
      },
      { index: 1, sentiment: 'no_content' },
    ])
  })

  it('stores the choice a categorical answer names, and nothing else', () => {
    const parsed = analysisPrompt('analysis.v3', 'categorical').OUTPUT_SCHEMA.parse({
      items: [
        { index: 0, values: ['outbound', ' api unggun '] },
        { index: 1, no_content: true },
        // Naming nothing is the same as saying so.
        { index: 2, values: [] },
      ],
    })

    expect(parsed.items).toEqual([
      {
        index: 0,
        sentiment: null,
        confidence: null,
        topics: ['outbound', 'api unggun'],
        keywords: [],
        summary: '',
      },
      { index: 1, sentiment: 'no_content' },
      { index: 2, sentiment: 'no_content' },
    ])
  })

  it('cuts an answer that runs over its bounds instead of failing the batch', () => {
    const parsed = analysisPrompt('analysis.v3', 'evaluative').OUTPUT_SCHEMA.safeParse({
      items: [
        {
          index: 0,
          sentiment: 'negative',
          confidence: 1.4,
          topics: ['a', 'b', 'c', 'd', 'e', 'f'],
          keywords: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
          summary: 'x'.repeat(400),
        },
        { index: 1, sentiment: 'no_content' },
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const [first] = parsed.data.items
    expect(first).toMatchObject({ sentiment: 'negative', confidence: 1 })
    if (!first || first.sentiment === 'no_content') return
    expect(first.topics).toHaveLength(3)
    expect(first.keywords).toHaveLength(5)
    expect(first.summary).toHaveLength(280)
    // analysis.v2 refuses the same reply whole: 30 answers lost to one.
    expect(
      analysisPrompt('analysis.v2').OUTPUT_SCHEMA.safeParse({
        items: [{ ...first, topics: ['a', 'b', 'c', 'd', 'e', 'f'] }],
      }).success,
    ).toBe(false)
  })

  it('shows a categorical batch the choices earlier batches named', () => {
    const template = analysisPrompt('analysis.v3', 'categorical').USER_TEMPLATE
    expect(template(['x'], { question: QUESTION })).not.toContain('Pilihan yang sudah')
    expect(
      template(['x'], { question: QUESTION, knownValues: ['outbound', 'pensi'] }),
    ).toContain('Pilihan yang sudah dipakai: ["outbound","pensi"]')
  })
})

describe('non-answers by mode', () => {
  it('keeps "tidak" where the question asks for a choice', () => {
    // Under "Ada saran?" this says nothing; under "Ikut lagi tahun depan?" it
    // is the answer.
    expect(isNonAnswer('tidak')).toBe(true)
    expect(isNonAnswer('tidak', 'thematic')).toBe(true)
    expect(isNonAnswer('tidak', 'categorical')).toBe(false)
    expect(isNonAnswer('Tidak ada', 'categorical')).toBe(false)
  })

  it('still drops what says nothing at all', () => {
    for (const mode of ['evaluative', 'thematic', 'categorical', 'scale'] as const) {
      expect(isNonAnswer('-', mode)).toBe(true)
      expect(isNonAnswer('...', mode)).toBe(true)
      expect(isNonAnswer('N/A', mode)).toBe(true)
    }
  })
})

describe('scaleValue', () => {
  it('reads a number however it was typed', () => {
    expect(scaleValue('4')).toBe('4')
    expect(scaleValue(' 4.0 ')).toBe('4')
    expect(scaleValue('8,5')).toBe('8.5')
    expect(scaleValue('10')).toBe('10')
  })

  it('takes the answer, not the scale, from "4 dari 5"', () => {
    expect(scaleValue('4/5')).toBe('4')
    expect(scaleValue('4 dari 5')).toBe('4')
    expect(scaleValue('9 / 10')).toBe('9')
  })

  it('finds the one number among words', () => {
    expect(scaleValue('5 bintang')).toBe('5')
    expect(scaleValue('nilai 4')).toBe('4')
  })

  it('reads a number written out, when it is the whole answer', () => {
    expect(scaleValue('lima')).toBe('5')
    expect(scaleValue(' Sepuluh ')).toBe('10')
    // "lima belas" is not on the list, and guessing would be worse than keeping it.
    expect(scaleValue('lima belas')).toBe('lima belas')
  })

  it('keeps a worded answer as written, for the count and not the mean', () => {
    expect(scaleValue('Sangat  Setuju')).toBe('sangat setuju')
    // Two numbers and no way to tell which is the answer.
    expect(scaleValue('antara 3 sampai 4')).toBe('antara 3 sampai 4')
  })

  it('gives nothing for an answer that gives nothing', () => {
    expect(scaleValue('-')).toBeNull()
    expect(scaleValue('  ')).toBeNull()
  })
})

describe('planBatches with modes', () => {
  const modes: Record<string, 'evaluative' | 'thematic' | 'categorical' | 'scale'> = {
    kritik: 'evaluative',
    pilihan: 'categorical',
    nilai: 'scale',
  }
  const modeOf = (questionId: string | null) => modes[questionId ?? ''] ?? 'evaluative'

  it('reads scale answers itself and sends none of them to a model', () => {
    const plan = planBatches(
      [
        { id: 's1', text: '4', questionId: 'nilai' },
        { id: 's2', text: '5/5', questionId: 'nilai' },
        { id: 's3', text: '-', questionId: 'nilai' },
      ],
      BATCH_SIZE,
      modeOf,
    )

    expect(plan.batches).toEqual([])
    expect(plan.values).toEqual([
      { id: 's1', value: '4' },
      { id: 's2', value: '5' },
    ])
    expect(plan.skippedIds).toEqual(['s3'])
  })

  it('keeps a one-word choice that would be too short to be an aspiration', () => {
    const plan = planBatches(
      [
        { id: 'c1', text: 'ya', questionId: 'pilihan' },
        { id: 'c2', text: 'A', questionId: 'pilihan' },
        { id: 'c3', text: 'tidak', questionId: 'pilihan' },
        { id: 'e1', text: 'ya', questionId: 'kritik' },
        { id: 'e2', text: 'tidak', questionId: 'kritik' },
      ],
      BATCH_SIZE,
      modeOf,
    )

    expect(plan.batches).toEqual([
      {
        questionId: 'pilihan',
        mode: 'categorical',
        items: [
          { id: 'c1', text: 'ya' },
          { id: 'c2', text: 'A' },
          { id: 'c3', text: 'tidak' },
        ],
      },
    ])
    expect(plan.skippedIds).toEqual(['e1', 'e2'])
  })

  it('reads everything as evaluative when nobody says otherwise', () => {
    const plan = planBatches([{ id: 'r1', text: 'Konsumsi telat', questionId: 'x' }])
    expect(plan.batches[0]?.mode).toBe('evaluative')
    expect(plan.values).toEqual([])
  })
})

/** Answers each batch as its mode would, and records what it was asked. */
function modeAdapter(
  reply: (input: BatchInput, call: number) => Result<BatchOutput, AppError> | null = () =>
    null,
) {
  const seen: BatchInput[] = []
  const adapter = {
    name: 'stub',
    summarize: vi.fn(),
    classifyColumns: vi.fn(),
    mergeTopics: vi.fn(),
    confirmMerges: vi.fn(),
    groupThemes: vi.fn(),
    writeInsights: vi.fn(),
    analyzeBatch: vi.fn(async (input: BatchInput) => {
      seen.push(input)
      const custom = reply(input, seen.length)
      if (custom) return custom
      return ok({
        items: input.texts.map((text, index) => ({
          index,
          sentiment: input.mode === 'evaluative' ? ('neutral' as const) : null,
          confidence: input.mode === 'evaluative' ? 0.8 : null,
          topics: [text.toLowerCase()],
          keywords: [],
          summary: '',
        })),
        modelId: 'stub-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        costMicroIdr: 1,
      })
    }),
  } as unknown as LlmAdapter
  return { adapter, seen }
}

describe('analyzeResponses with modes', () => {
  it('analyses a dataset of numbers without one model call', async () => {
    const { adapter, seen } = modeAdapter()

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      questions: { q1: { text: 'Seberapa puas? (1-5)', mode: 'scale' } },
      responses: [
        { id: 'r1', text: '4', questionId: 'q1' },
        { id: 'r2', text: '5', questionId: 'q1' },
        { id: 'r3', text: '-', questionId: 'q1' },
      ],
    })

    expect(seen).toHaveLength(0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.results).toEqual([
      expect.objectContaining({ responseId: 'r1', sentiment: null, topics: ['4'] }),
      expect.objectContaining({ responseId: 'r2', sentiment: null, topics: ['5'] }),
    ])
    expect(result.value.noContentResponseIds).toEqual(['r3'])
    expect(result.value.costMicroIdr).toBe(0)
  })

  it('sends each batch with its question and the mode it is read in', async () => {
    const { adapter, seen } = modeAdapter()

    await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      questions: {
        q1: { text: 'Kritik dan saran', mode: 'evaluative' },
        q2: { text: 'Nilai apa yang kamu pelajari?', mode: 'thematic' },
      },
      responses: [
        { id: 'r1', text: 'Konsumsi telat', questionId: 'q1' },
        { id: 'r2', text: 'Kerja sama tim', questionId: 'q2' },
      ],
    })

    expect(seen.map((input) => [input.mode, input.question]).sort()).toEqual([
      ['evaluative', 'Kritik dan saran'],
      ['thematic', 'Nilai apa yang kamu pelajari?'],
    ])
  })

  it('runs the batches of a categorical question in order, each told what came before', async () => {
    const { adapter, seen } = modeAdapter()
    const responses = Array.from({ length: BATCH_SIZE + 2 }, (_, index) => ({
      id: `r${index}`,
      // The first batch names "outbound" throughout; the second sees it.
      text: index < BATCH_SIZE ? 'Outbound' : 'Pensi',
      questionId: 'q1',
    }))

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      questions: { q1: { text: QUESTION, mode: 'categorical' } },
      responses,
    })

    expect(result.ok).toBe(true)
    expect(seen).toHaveLength(2)
    expect(seen[0]?.knownValues).toEqual([])
    expect(seen[1]?.knownValues).toEqual(['outbound'])
  })

  it('asks once more when a batch reply broke the format, and keeps its answers', async () => {
    const malformed = err(
      appError(
        ERROR_CODES.UPSTREAM,
        'Balasan model tidak sesuai format yang diharapkan',
        {
          details: {
            malformedReply: true,
            issues: 1,
            where: ['items.3.index: invalid_type'],
          },
        },
      ),
    )
    const { adapter, seen } = modeAdapter((_, call) => (call === 1 ? malformed : null))

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      responses: [{ id: 'r1', text: 'Konsumsi telat' }],
    })

    expect(seen).toHaveLength(2)
    // The same request, not a reworded one.
    expect(seen[1]).toEqual(seen[0])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.failedResponseIds).toEqual([])
    expect(result.value.results).toHaveLength(1)
  })

  it('does not ask again when the provider was unreachable', async () => {
    const down = err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI tidak merespons'))
    const { adapter, seen } = modeAdapter(() => down)

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      responses: [{ id: 'r1', text: 'Konsumsi telat' }],
    })

    // The adapter already retried that; a second round only holds the job open.
    expect(seen).toHaveLength(1)
    expect(result.ok).toBe(false)
  })

  it('keeps the numbers it read when every model batch fails', async () => {
    const down = err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI tidak merespons'))
    const { adapter } = modeAdapter(() => down)

    const result = await analyzeResponses(adapter, {
      jobId: 'job-1',
      promptVersion: 'analysis.v3',
      questions: {
        q1: { text: 'Kritik', mode: 'evaluative' },
        q2: { text: 'Nilai', mode: 'scale' },
      },
      responses: [
        { id: 'r1', text: 'Konsumsi telat', questionId: 'q1' },
        { id: 'r2', text: '4', questionId: 'q2' },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.results.map((row) => row.responseId)).toEqual(['r2'])
    expect(result.value.failedResponseIds).toEqual(['r1'])
  })
})
