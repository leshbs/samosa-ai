import { describe, expect, it, vi } from 'vitest'
import { READ_PAGE_SIZE, readAll } from '@/lib/supabase/read-all'
import { BATCH_SIZE, planBatches } from '@/modules/analysis/services/batcher'
import {
  questionNoContent,
  readQuestionCounts,
  toStoredQuestionCounts,
} from '@/modules/analysis/services/question-counts'
import {
  UNKNOWN_QUESTION_TEXT,
  groupByQuestion,
} from '@/modules/reporting/aggregators/sections'
import { exportResponsesToCsv } from '@/modules/reporting/exporters/csv-exporter'

describe('readAll', () => {
  /** A table of `total` rows that hands out at most one page per request. */
  function table(total: number) {
    const rows = Array.from({ length: total }, (_, index) => ({ id: index }))
    return vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }))
  }

  it('reads past the 1,000 rows a single select stops at', async () => {
    const page = table(2_400)

    const { data, error } = await readAll(page)

    expect(error).toBeNull()
    expect(data).toHaveLength(2_400)
    // In order, each row once.
    expect(data.map((row) => row.id)).toEqual(Array.from({ length: 2_400 }, (_, i) => i))
    expect(page.mock.calls).toEqual([
      [0, READ_PAGE_SIZE - 1],
      [READ_PAGE_SIZE, 2 * READ_PAGE_SIZE - 1],
      [2 * READ_PAGE_SIZE, 3 * READ_PAGE_SIZE - 1],
    ])
  })

  it('asks once more after a full page, because a full page proves nothing', async () => {
    const page = table(READ_PAGE_SIZE)

    const { data } = await readAll(page)

    expect(data).toHaveLength(READ_PAGE_SIZE)
    expect(page).toHaveBeenCalledTimes(2)
  })

  it('makes one request for a table that fits in one page', async () => {
    const page = table(181)

    expect((await readAll(page)).data).toHaveLength(181)
    expect(page).toHaveBeenCalledTimes(1)
  })

  it('returns the error and no partial rows when a page fails', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const result = await readAll(page, 2)

    // Half a dataset analysed as if it were whole is the bug this exists for.
    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'timeout' })
  })
})

describe('planBatches with questions', () => {
  const answer = (id: string, questionId: string) => ({
    id,
    questionId,
    text: `jawaban yang cukup panjang ${id}`,
  })

  it('never puts answers to two questions in one batch', () => {
    // Interleaved, the way a sheet read row by row arrives.
    const responses = Array.from({ length: 40 }, (_, index) =>
      answer(`r${index}`, index % 2 === 0 ? 'kritik' : 'saran'),
    )

    const plan = planBatches(responses)

    expect(plan.batches.map((batch) => [batch.questionId, batch.items.length])).toEqual([
      ['kritik', 20],
      ['saran', 20],
    ])
    for (const batch of plan.batches) {
      const parity = batch.questionId === 'kritik' ? 0 : 1
      expect(batch.items.every((item) => Number(item.id.slice(1)) % 2 === parity)).toBe(
        true,
      )
    }
  })

  it('cuts each question into its own batches', () => {
    const responses = [
      ...Array.from({ length: BATCH_SIZE + 5 }, (_, i) => answer(`a${i}`, 'kritik')),
      ...Array.from({ length: 3 }, (_, i) => answer(`b${i}`, 'saran')),
    ]

    expect(planBatches(responses).batches.map((batch) => batch.items.length)).toEqual([
      BATCH_SIZE,
      5,
      3,
    ])
  })

  it('still drops a non-answer whatever question it answers', () => {
    const plan = planBatches([
      answer('r1', 'kritik'),
      { id: 'r2', questionId: 'saran', text: 'tidak ada' },
    ])

    expect(plan.skippedIds).toEqual(['r2'])
    // "saran" has nothing left to send, so it has no batch at all.
    expect(plan.batches.map((batch) => batch.questionId)).toEqual(['kritik'])
  })

  it('batches as before when no question is named', () => {
    const plan = planBatches([
      { id: 'r1', text: 'aspirasi yang cukup panjang' },
      { id: 'r2', text: 'aspirasi lain yang cukup panjang' },
    ])

    expect(plan.batches).toHaveLength(1)
    expect(plan.batches[0]?.questionId).toBeNull()
  })
})

describe('question counts', () => {
  it('survives the round trip to the column', () => {
    const counts = {
      q1: { analyzed: 127, noContent: 54, failed: 0, mode: 'categorical' as const },
    }

    expect(toStoredQuestionCounts(counts)).toEqual({
      q1: { analyzed: 127, no_content: 54, failed: 0, mode: 'categorical' },
    })
    expect(readQuestionCounts(toStoredQuestionCounts(counts))).toEqual(counts)
  })

  it('reads a job from before modes as naming none, and writes none back', () => {
    const stored = { q1: { analyzed: 127, no_content: 54, failed: 0 } }
    const counts = readQuestionCounts(stored)

    expect(counts.q1?.mode).toBeNull()
    expect(toStoredQuestionCounts(counts)).toEqual(stored)
    // A mode nobody defined is not trusted either.
    expect(
      readQuestionCounts({ q1: { ...stored.q1, mode: 'sentimen' } }).q1?.mode,
    ).toBeNull()
  })

  it('reads anything that is not the expected shape as no counts', () => {
    expect(readQuestionCounts(undefined)).toEqual({})
    expect(readQuestionCounts(null)).toEqual({})
    expect(readQuestionCounts([])).toEqual({})
    expect(readQuestionCounts({ q1: 'banyak' })).toEqual({})
    expect(readQuestionCounts({ q1: { analyzed: -3, no_content: '4' } })).toEqual({
      q1: { analyzed: 0, noContent: 0, failed: 0, mode: null },
    })
  })

  const job = (overrides = {}) => ({
    promptVersion: 'analysis.v2',
    noContentCount: 54,
    questionCounts: {},
    ...overrides,
  })

  it('reads a question its own count', () => {
    const counted = job({
      questionCounts: {
        q1: { analyzed: 127, noContent: 50, failed: 0, mode: null },
        q2: { analyzed: 90, noContent: 4, failed: 0, mode: null },
      },
    })

    expect(questionNoContent(counted, 'q1', 2)).toBe(50)
    expect(questionNoContent(counted, 'q2', 2)).toBe(4)
  })

  it('gives the only question of an older job the job total', () => {
    expect(questionNoContent(job(), 'q1', 1)).toBe(54)
  })

  it('says "not measured" rather than zero when it cannot know', () => {
    // A prompt that cannot tell a non-answer apart.
    expect(questionNoContent(job({ promptVersion: 'analysis.v1' }), 'q1', 1)).toBeNull()
    // Several questions and no per-question counts: the total cannot be split.
    expect(questionNoContent(job(), 'q1', 2)).toBeNull()
  })
})

describe('groupByQuestion', () => {
  const QUESTIONS = [
    { id: 'q1', text: 'Kritik', mode: 'evaluative' as const },
    { id: 'q2', text: 'Saran', mode: 'evaluative' as const },
    { id: 'q3', text: 'Usul lain', mode: 'evaluative' as const },
  ]
  const row = (responseId: string, questionId: string) => ({ responseId, questionId })

  it('puts each result under its question, in sheet order', () => {
    const sections = groupByQuestion(
      [row('r1', 'q2'), row('r2', 'q1'), row('r3', 'q2')],
      QUESTIONS,
    )

    expect(
      sections.map((s) => [s.question.text, s.rows.map((r) => r.responseId)]),
    ).toEqual([
      ['Kritik', ['r2']],
      ['Saran', ['r1', 'r3']],
      // Nobody gave an aspiration here; the question keeps its section.
      ['Usul lain', []],
    ])
  })

  it('keeps results whose question it cannot name, in a section of their own', () => {
    const sections = groupByQuestion([row('r1', 'q1'), row('r2', 'hilang')], QUESTIONS)

    expect(sections.at(-1)?.question.text).toBe(UNKNOWN_QUESTION_TEXT)
    expect(sections.at(-1)?.rows.map((r) => r.responseId)).toEqual(['r2'])
  })

  it('is one section when the questions could not be read', () => {
    const sections = groupByQuestion([row('r1', 'q1'), row('r2', 'q1')], [])

    expect(sections).toHaveLength(1)
    expect(sections[0]?.rows).toHaveLength(2)
  })
})

describe('exportResponsesToCsv', () => {
  const base = {
    sentiment: 'negative' as const,
    confidence: 0.9,
    topics: ['konsumsi'],
    keywords: ['telat'],
  }

  it('appends the question, the respondent, the mode and the raw labels, leaving the first five columns alone', () => {
    const csv = exportResponsesToCsv(
      [
        { ...base, responseText: 'Konsumsi telat', questionId: 'q1', respondentIndex: 0 },
        { ...base, responseText: 'Tambah vendor', questionId: 'q2', respondentIndex: 0 },
      ],
      [
        { id: 'q1', text: 'Kritik', mode: 'evaluative' },
        { id: 'q2', text: 'Saran' },
      ],
    )
    const lines = csv.replace(/^﻿/, '').split('\n')

    expect(lines[0]).toBe(
      'response,sentiment,sentiment_score,topics,keywords,question,respondent,mode,topics_raw',
    )
    expect(lines[1]).toBe(
      'Konsumsi telat,negative,0.90,konsumsi,telat,Kritik,1,evaluative,konsumsi',
    )
    expect(lines[2]).toBe('Tambah vendor,negative,0.90,konsumsi,telat,Saran,1,,konsumsi')
  })

  it('writes the topic the report counts, and beside it the labels the model gave', () => {
    const csv = exportResponsesToCsv([
      {
        ...base,
        responseText: 'Jadi lebih pede',
        topics: ['kepercayaan diri'],
        rawTopics: ['percaya diri', 'kepercayaan diri'],
      },
    ])

    expect(csv.replace(/^\uFEFF/, '').split('\n')[1]).toBe(
      'Jadi lebih pede,negative,0.90,kepercayaan diri,telat,,,,percaya diri; kepercayaan diri',
    )
  })

  it('leaves sentiment and its score empty where none was judged', () => {
    const csv = exportResponsesToCsv(
      [
        {
          responseText: 'Outbond nya seru',
          sentiment: null,
          confidence: null,
          topics: ['outbound'],
          keywords: [],
          questionId: 'q1',
          respondentIndex: 4,
        },
      ],
      [{ id: 'q1', text: 'Kegiatan paling seru?', mode: 'categorical' }],
    )

    // "null" in a spreadsheet cell would read as an answer.
    expect(csv.replace(/^\uFEFF/, '').split('\n')[1]).toBe(
      'Outbond nya seru,,,outbound,,Kegiatan paling seru?,5,categorical,outbound',
    )
  })

  it('leaves the cells empty for a row that names no question', () => {
    const csv = exportResponsesToCsv([{ ...base, responseText: 'Konsumsi telat' }])

    expect(csv.replace(/^﻿/, '').split('\n')[1]).toBe(
      'Konsumsi telat,negative,0.90,konsumsi,telat,,,,konsumsi',
    )
  })
})
