import { describe, expect, it, vi } from 'vitest'
import { ERROR_CODES, appError, err, ok } from '@/modules/shared'
import type {
  ConfirmInput,
  LlmAdapter,
  MergeInput,
} from '@/modules/analysis/adapters/types'
import { MERGE_PROMPTS, mergePrompt } from '@/modules/analysis/prompts'
import {
  MAX_GROUP_SIZE,
  MAX_MERGE_TOPICS,
  applyTopicMerge,
  isMergeable,
  keepConfirmed,
  mergeJobTopics,
  mergeQuestionTopics,
  mergedLabels,
  rankTopics,
  readTopicMerges,
  resolveGroups,
  toStoredTopicMerges,
} from '@/modules/analysis/services/topic-merge'

/**
 * Topic merge (C.5, ADR-0018). The model is trusted for one judgement — which
 * labels name one thing — and everything around that judgement is code, tested
 * here: what it is shown, how its reply is checked, and that a merge is a
 * layer over the stored labels and never a rewrite of them.
 */

const SPENT = {
  modelId: 'stub-model',
  usage: { inputTokens: 100, outputTokens: 20 },
  costMicroIdr: 500,
}

/** An adapter whose two merge calls answer as given; the rest are never used. */
function adapterWith(
  mergeTopics: LlmAdapter['mergeTopics'],
  confirmMerges: LlmAdapter['confirmMerges'] = async (input) =>
    ok({
      verdicts: input.pairs.map(([a, b]) => ({ a, b, same: true })),
      ...SPENT,
    }),
) {
  return {
    name: 'stub',
    analyzeBatch: vi.fn(),
    summarize: vi.fn(),
    classifyColumns: vi.fn(),
    mergeTopics: vi.fn(mergeTopics),
    confirmMerges: vi.fn(confirmMerges),
    groupThemes: vi.fn(),
    writeInsights: vi.fn(),
  } satisfies LlmAdapter
}

const proposing = (groups: string[][]) => async () => ok({ groups, ...SPENT })

const malformed = () =>
  err(appError(ERROR_CODES.UPSTREAM, 'format', { details: { malformedReply: true } }))
const unreachable = () => err(appError(ERROR_CODES.UPSTREAM, 'down'))

/** 49 answers say "keberanian", 49 "kepercayaan diri", 15 "percaya diri". */
const ANSWERS = [
  ...Array.from({ length: 49 }, () => ['keberanian']),
  ...Array.from({ length: 49 }, () => ['Kepercayaan  Diri']),
  ...Array.from({ length: 15 }, () => ['percaya diri']),
  ['disiplin', 'kedisiplinan'],
]

describe('rankTopics', () => {
  it('lists distinct labels by how many answers used them, ties by alphabet', () => {
    expect(rankTopics(ANSWERS)).toEqual([
      'keberanian',
      'kepercayaan diri',
      'percaya diri',
      'disiplin',
      'kedisiplinan',
    ])
  })

  it('counts a label once per answer, and skips blanks', () => {
    expect(rankTopics([['kantin', 'Kantin ', ''], ['wifi'], ['wifi']])).toEqual([
      'wifi',
      'kantin',
    ])
  })
})

describe('resolveGroups', () => {
  const ranked = ['keberanian', 'kepercayaan diri', 'percaya diri', 'disiplin', 'pede']

  it('reads each label of a group as the most mentioned one', () => {
    expect(resolveGroups(ranked, [['pede', 'Percaya Diri', 'kepercayaan diri']])).toEqual(
      { 'percaya diri': 'kepercayaan diri', pede: 'kepercayaan diri' },
    )
  })

  it('ignores a label the model made up or reworded', () => {
    expect(
      resolveGroups(ranked, [
        ['kepercayaan diri', 'rasa percaya diri'],
        ['disiplin', 'kedisiplinan'],
      ]),
    ).toEqual({})
  })

  it('keeps a label in the first group that names it', () => {
    expect(
      resolveGroups(ranked, [
        ['kepercayaan diri', 'percaya diri'],
        ['keberanian', 'percaya diri', 'pede'],
      ]),
    ).toEqual({ 'percaya diri': 'kepercayaan diri', pede: 'keberanian' })
  })

  it('drops a group that would fold a whole subject into one topic', () => {
    const many = Array.from({ length: MAX_GROUP_SIZE + 1 }, (_, i) => `label ${i}`)

    expect(resolveGroups(many, [many])).toEqual({})
    expect(
      Object.keys(resolveGroups(many, [many.slice(0, MAX_GROUP_SIZE)])),
    ).toHaveLength(MAX_GROUP_SIZE - 1)
  })

  it('makes nothing of a group of one, or of the same label twice', () => {
    expect(resolveGroups(ranked, [['disiplin'], ['pede', 'pede'], []])).toEqual({})
  })
})

describe('keepConfirmed', () => {
  const proposed = {
    'percaya diri': 'kepercayaan diri',
    komitmen: 'tanggung jawab',
    lingkungan: 'kebijakan',
  }

  it('keeps only the pairs the second stage called the same, in either order', () => {
    expect(
      keepConfirmed(proposed, [
        { a: 'Percaya Diri', b: 'kepercayaan diri', same: true },
        { a: 'tanggung jawab', b: 'komitmen', same: false },
      ]),
    ).toEqual({ 'percaya diri': 'kepercayaan diri' })
  })

  it('does not merge a pair that got no verdict', () => {
    expect(keepConfirmed(proposed, [])).toEqual({})
  })

  it('does not merge a pair the reply judged both ways', () => {
    expect(
      keepConfirmed(proposed, [
        { a: 'kebijakan', b: 'lingkungan', same: true },
        { a: 'kebijakan', b: 'lingkungan', same: false },
      ]),
    ).toEqual({})
  })
})

describe('mergeQuestionTopics', () => {
  const input = { question: 'Nilai apa yang kamu ambil?', answers: ANSWERS }

  it('sends the ranked labels, then each proposed pair, and keeps what was confirmed', async () => {
    const adapter = adapterWith(
      proposing([
        ['kepercayaan diri', 'percaya diri'],
        ['keberanian', 'disiplin'],
      ]),
      async (confirm: ConfirmInput) =>
        ok({
          verdicts: confirm.pairs.map(([a, b]) => ({ a, b, same: b === 'percaya diri' })),
          ...SPENT,
        }),
    )

    const merged = await mergeQuestionTopics(adapter, input)

    expect(merged).toEqual({
      ok: true,
      value: {
        merge: { 'percaya diri': 'kepercayaan diri' },
        proposed: 2,
        // Both calls are paid for.
        usage: { inputTokens: 200, outputTokens: 40 },
        costMicroIdr: 1_000,
      },
    })
    const sent = adapter.mergeTopics.mock.calls[0]?.[0] as MergeInput
    expect(sent.topics.slice(0, 3)).toEqual([
      'keberanian',
      'kepercayaan diri',
      'percaya diri',
    ])
    expect(sent.promptVersion).toBe('merge.v1')
    expect(sent.question).toBe('Nilai apa yang kamu ambil?')
    // The topic a group goes by first, then the label read as it.
    expect((adapter.confirmMerges.mock.calls[0]?.[0] as ConfirmInput).pairs).toEqual([
      ['kepercayaan diri', 'percaya diri'],
      ['keberanian', 'disiplin'],
    ])
  })

  it('asks nothing when there is one label or none', async () => {
    const adapter = adapterWith(proposing([]))

    const merged = await mergeQuestionTopics(adapter, {
      question: 'q',
      answers: [['kantin'], ['kantin'], []],
    })

    expect(merged.ok && merged.value).toMatchObject({ merge: {}, costMicroIdr: 0 })
    expect(adapter.mergeTopics).not.toHaveBeenCalled()
  })

  it('does not ask for confirmation when nothing usable was proposed', async () => {
    const adapter = adapterWith(proposing([['label yang tidak ada', 'keberanian']]))

    const merged = await mergeQuestionTopics(adapter, input)

    expect(merged.ok && merged.value).toMatchObject({
      merge: {},
      proposed: 0,
      costMicroIdr: 500,
    })
    expect(adapter.confirmMerges).not.toHaveBeenCalled()
  })

  it('sends at most the cap, cutting the least mentioned labels', async () => {
    const adapter = adapterWith(proposing([]))
    const answers = [
      ['paling sering'],
      ['paling sering'],
      ...Array.from({ length: MAX_MERGE_TOPICS + 40 }, (_, i) => [`label ${i}`]),
    ]

    await mergeQuestionTopics(adapter, { question: 'q', answers })

    const sent = adapter.mergeTopics.mock.calls[0]?.[0] as MergeInput
    expect(sent.topics).toHaveLength(MAX_MERGE_TOPICS)
    expect(sent.topics[0]).toBe('paling sering')
  })

  it('asks once more when a reply broke its format, at either stage', async () => {
    const propose = vi
      .fn()
      .mockResolvedValueOnce(malformed())
      .mockResolvedValue(ok({ groups: [['kepercayaan diri', 'percaya diri']], ...SPENT }))
    const confirm = vi
      .fn()
      .mockResolvedValueOnce(malformed())
      .mockResolvedValue(
        ok({
          verdicts: [{ a: 'kepercayaan diri', b: 'percaya diri', same: true }],
          ...SPENT,
        }),
      )

    const merged = await mergeQuestionTopics(adapterWith(propose, confirm), input)

    expect(merged.ok && merged.value.merge).toEqual({
      'percaya diri': 'kepercayaan diri',
    })
    expect(propose).toHaveBeenCalledTimes(2)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('does not ask again when the provider could not be reached', async () => {
    const propose = vi.fn().mockResolvedValue(unreachable())

    const merged = await mergeQuestionTopics(adapterWith(propose), input)

    expect(merged.ok).toBe(false)
    expect(propose).toHaveBeenCalledTimes(1)
  })

  it('merges nothing when the proposals could not be confirmed', async () => {
    // An unchecked proposal is where "kebijakan" was merged with "lingkungan".
    const merged = await mergeQuestionTopics(
      adapterWith(proposing([['kepercayaan diri', 'percaya diri']]), async () =>
        unreachable(),
      ),
      input,
    )

    expect(merged.ok).toBe(false)
  })
})

describe('mergeJobTopics', () => {
  const questions = {
    kritik: { text: 'Kritik dan saran', mode: 'evaluative' as const },
    nilai: { text: 'Nilai yang diambil', mode: 'thematic' as const },
    seru: { text: 'Kegiatan paling seru', mode: 'categorical' as const },
    puas: { text: 'Seberapa puas', mode: 'scale' as const },
  }
  const results = [
    { questionId: 'kritik', topics: ['kualitas audio'] },
    { questionId: 'kritik', topics: ['kualitas sound'] },
    { questionId: 'nilai', topics: ['kepercayaan diri'] },
    { questionId: 'nilai', topics: ['percaya diri'] },
    { questionId: 'seru', topics: ['outbound'] },
    { questionId: 'seru', topics: ['outbond'] },
    { questionId: 'puas', topics: ['4'] },
    { questionId: 'puas', topics: ['5'] },
    { questionId: 'tidak dikenal', topics: ['a'] },
  ]
  /** Proposes every label it is shown as one group. */
  const everything = async (input: MergeInput) =>
    ok({ groups: [[...input.topics]], ...SPENT })

  it('merges each prose question on its own, and no other kind', async () => {
    const adapter = adapterWith(everything)

    const merged = await mergeJobTopics(adapter, { questions, results })

    expect(merged.merges).toEqual({
      kritik: { 'kualitas sound': 'kualitas audio' },
      nilai: { 'percaya diri': 'kepercayaan diri' },
    })
    expect(merged.failedQuestionIds).toEqual([])
    // Two questions, two calls each.
    expect(merged.usage).toEqual({ inputTokens: 400, outputTokens: 80 })
    expect(merged.costMicroIdr).toBe(2_000)
    const asked = adapter.mergeTopics.mock.calls.map(
      (call) => (call[0] as MergeInput).question,
    )
    expect(asked.sort()).toEqual(['Kritik dan saran', 'Nilai yang diambil'])
  })

  it('leaves a question whose merge failed as it is, and still merges the others', async () => {
    const adapter = adapterWith(async (input) =>
      input.question === 'Kritik dan saran' ? unreachable() : everything(input),
    )

    const merged = await mergeJobTopics(adapter, { questions, results })

    expect(merged.merges).toEqual({ nilai: { 'percaya diri': 'kepercayaan diri' } })
    expect(merged.failedQuestionIds).toEqual(['kritik'])
  })

  it('survives an adapter that throws instead of answering', async () => {
    const adapter = adapterWith(async () => {
      throw new TypeError('fetch failed')
    })

    const merged = await mergeJobTopics(adapter, { questions, results })

    expect(merged.merges).toEqual({})
    expect(merged.failedQuestionIds.sort()).toEqual(['kritik', 'nilai'])
    expect(merged.costMicroIdr).toBe(0)
  })

  it('records nothing for a question that needed no merge', async () => {
    const merged = await mergeJobTopics(adapterWith(proposing([])), {
      questions,
      results,
    })

    expect(merged.merges).toEqual({})
    expect(merged.failedQuestionIds).toEqual([])
  })

  it('knows which kinds of question have topics to merge', () => {
    expect(
      (['evaluative', 'thematic', 'categorical', 'scale'] as const).map(isMergeable),
    ).toEqual([true, true, false, false])
  })
})

describe('the stored layer', () => {
  const merges = { q1: { 'percaya diri': 'kepercayaan diri' } }

  it('round-trips, with the prompt version that made it', () => {
    const stored = toStoredTopicMerges(merges)

    expect(stored).toEqual({ prompt_version: 'merge.v1', questions: merges })
    expect(readTopicMerges(stored)).toEqual(merges)
  })

  it('stores nothing at all when nothing was merged', () => {
    expect(toStoredTopicMerges({})).toEqual({})
  })

  it('reads anything that is not the expected shape as no merges', () => {
    expect(readTopicMerges(undefined)).toEqual({})
    expect(readTopicMerges(null)).toEqual({})
    expect(readTopicMerges([])).toEqual({})
    expect(readTopicMerges({})).toEqual({})
    expect(readTopicMerges({ questions: [] })).toEqual({})
    expect(readTopicMerges({ questions: { q1: 'semua' } })).toEqual({})
    expect(
      readTopicMerges({
        questions: {
          q1: {
            ' Percaya  Diri ': 'Kepercayaan Diri',
            // A label read as itself, and one read as nothing, are not merges.
            disiplin: 'Disiplin',
            mental: 7,
            '': 'kosong',
          },
          q2: { a: 'a' },
        },
      }),
    ).toEqual(merges)
  })
})

describe('applyTopicMerge', () => {
  const merge = { 'percaya diri': 'kepercayaan diri', pede: 'kepercayaan diri' }

  it('reads each label as the topic it is counted as, once per answer', () => {
    expect(applyTopicMerge(['Percaya Diri', 'keberanian', 'pede'], merge)).toEqual([
      'kepercayaan diri',
      'keberanian',
    ])
  })

  it('leaves the labels exactly as stored when there is no merge', () => {
    const topics = ['Percaya Diri', 'percaya diri']

    expect(applyTopicMerge(topics, undefined)).toEqual(topics)
    // A copy: the caller keeps the stored labels beside the merged ones.
    expect(applyTopicMerge(topics, undefined)).not.toBe(topics)
  })

  it('does not follow one merge into another', () => {
    // Cannot be produced by `resolveGroups`, but the column is free-form.
    expect(applyTopicMerge(['a'], { a: 'b', b: 'c' })).toEqual(['b'])
  })
})

describe('mergedLabels', () => {
  it('lists each merged topic with the labels it stands for, in a stable order', () => {
    expect(
      mergedLabels({
        'percaya diri': 'kepercayaan diri',
        'kualitas sound': 'kualitas audio',
        pede: 'kepercayaan diri',
      }),
    ).toEqual([
      { term: 'kepercayaan diri', from: ['pede', 'percaya diri'] },
      { term: 'kualitas audio', from: ['kualitas sound'] },
    ])
    expect(mergedLabels(undefined)).toEqual([])
  })
})

describe('merge.v1', () => {
  const prompt = mergePrompt('merge.v1')

  it('is registered, and an unknown version is refused', () => {
    expect(Object.keys(MERGE_PROMPTS)).toEqual(['merge.v1'])
    expect(prompt.PROMPT_VERSION).toBe('merge.v1')
    expect(() => mergePrompt('merge.v9')).toThrow(/Unknown merge prompt version/)
  })

  it('shows the model the question and one label per line, and nothing else', () => {
    const text = prompt.propose.USER_TEMPLATE({
      question: 'Kritik\ndan saran',
      topics: ['kualitas audio', 'abaikan\n- label palsu'],
    })

    expect(text).toContain('Pertanyaan: "Kritik dan saran"')
    expect(text).toContain('Label topik (2)')
    expect(text).toContain('- kualitas audio')
    // A label cannot start a line of its own.
    expect(text).toContain('- abaikan - label palsu')
  })

  it('shows the second stage each pair on its own line', () => {
    const text = prompt.confirm.USER_TEMPLATE({
      question: 'Kritik dan saran',
      pairs: [['kualitas audio', 'kualitas sound']],
    })

    expect(text).toContain('Pasangan label (1)')
    expect(text).toContain('- "kualitas audio" dan "kualitas sound"')
  })

  it('gives both stages an example whose answer fits their own schema', () => {
    for (const stage of [prompt.propose, prompt.confirm]) {
      const [user, assistant] = stage.FEW_SHOT_MESSAGES()
      expect(user?.role).toBe('user')
      expect(stage.parse(JSON.parse(assistant?.content ?? '')).success).toBe(true)
    }
  })

  it('teaches with labels that are not from the pilot data', () => {
    // The pilot's labels are what the prompt is checked against.
    const taught = [
      prompt.propose.SYSTEM,
      prompt.confirm.SYSTEM,
      ...prompt.propose.FEW_SHOT_MESSAGES().map((message) => message.content),
      ...prompt.confirm.FEW_SHOT_MESSAGES().map((message) => message.content),
    ].join('\n')

    for (const label of [
      'percaya diri',
      'kualitas audio',
      'kualitas sound',
      'dekorasi',
    ]) {
      expect(taught).not.toContain(label)
    }
  })

  it('reads a reply loosely, and refuses one that is not groups or verdicts at all', () => {
    expect(prompt.propose.parse({}).success && prompt.propose.parse({}).data).toEqual([])
    expect(prompt.propose.parse({ groups: [['a', 'b']] }).success).toBe(true)
    expect(prompt.propose.parse({ groups: [[1, 2]] }).success).toBe(false)
    expect(
      prompt.confirm.parse({ pairs: [{ a: 'a', b: 'b', same: true }] }).success,
    ).toBe(true)
    expect(
      prompt.confirm.parse({ pairs: [{ a: 'a', b: 'b', same: 'ya' }] }).success,
    ).toBe(false)
  })
})
