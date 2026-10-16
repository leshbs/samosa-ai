// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '@/modules/shared'
import type { BatchInput } from '@/modules/analysis/adapters/types'

/**
 * What the runner stores for a dataset whose questions are read differently,
 * and in what order. The order is the point of the second test: the summary is
 * written inside `onResultsReady`, and it reads each question's mode off the
 * job row. A real report showed what happens when that row is written after
 * the hook — every question was summarised as `evaluative`, and the insight
 * about a 1–5 scale quoted "4" as its evidence.
 */

const JOB = {
  id: 'job-1',
  organization_id: 'org-1',
  dataset_id: 'dataset-1',
  prompt_version: 'analysis.v3',
}
const QUESTIONS = [
  { id: 'q-kritik', question_text: 'Kritik dan saran', analysis_mode: 'evaluative' },
  { id: 'q-seru', question_text: 'Kegiatan paling seru?', analysis_mode: 'categorical' },
  { id: 'q-puas', question_text: 'Seberapa puas? (1-5)', analysis_mode: 'scale' },
]
const RESPONSES = [
  { id: 'r1', text: 'Konsumsi telat dua jam', question_id: 'q-kritik' },
  { id: 'r2', text: 'tidak ada', question_id: 'q-kritik' },
  { id: 'r3', text: 'Outbond', question_id: 'q-seru' },
  { id: 'r4', text: 'tidak', question_id: 'q-seru' },
  { id: 'r5', text: '4 dari 5', question_id: 'q-puas' },
  { id: 'r6', text: '-', question_id: 'q-puas' },
]

let jobUpdates: Array<Record<string, unknown>> = []
let inserted: Array<Record<string, unknown>> = []
let promptVersion = 'analysis.v3'

function table(name: string) {
  const builder = {
    update: (values: Record<string, unknown>) => {
      if (name === 'analysis_jobs') jobUpdates.push(values)
      return builder
    },
    insert: async (rows: Array<Record<string, unknown>>) => {
      if (name === 'analysis_results') inserted = rows
      return { error: null }
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: async () => ({ data: name === 'responses' ? RESPONSES : [], error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve(
        name === 'dataset_questions'
          ? { data: QUESTIONS, error: null }
          : { data: [{ ...JOB, prompt_version: promptVersion }], error: null },
      ),
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (name: string) => table(name) }),
}))

const seen: BatchInput[] = []
vi.mock('@/modules/analysis/adapters/openai', () => ({
  createOpenAiAdapter: () => ({
    name: 'stub',
    summarize: vi.fn(),
    classifyColumns: vi.fn(),
    mergeTopics: vi.fn(),
    confirmMerges: vi.fn(),
    groupThemes: vi.fn(),
    writeInsights: vi.fn(),
    analyzeBatch: async (input: BatchInput) => {
      seen.push(input)
      return ok({
        items: input.texts.map((text, index) => ({
          index,
          sentiment: input.mode === 'evaluative' ? ('negative' as const) : null,
          confidence: input.mode === 'evaluative' ? 0.9 : null,
          topics: [text.toLowerCase()],
          keywords: [],
          summary: input.mode === 'evaluative' ? 'Ringkasan.' : '',
        })),
        modelId: 'stub-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        costMicroIdr: 1,
      })
    },
  }),
}))

const { runJob } = await import('@/modules/analysis/services/job-runner')

beforeEach(() => {
  jobUpdates = []
  inserted = []
  seen.length = 0
  promptVersion = 'analysis.v3'
})

describe('runJob with questions of different kinds', () => {
  it('stores a sentiment only for the question that asks for a judgement', async () => {
    const result = await runJob('job-1')

    expect(result.ok).toBe(true)
    const byResponse = new Map(inserted.map((row) => [row.response_id, row]))
    expect(byResponse.get('r1')).toMatchObject({
      sentiment: 'negative',
      sentiment_confidence: 0.9,
      summary: 'Ringkasan.',
    })
    // "tidak" answers "paling seru?" — it is kept — and "tidak ada" under
    // "kritik dan saran" is not.
    expect([...byResponse.keys()].sort()).toEqual(['r1', 'r3', 'r4', 'r5'])
    for (const id of ['r3', 'r4', 'r5']) {
      expect(byResponse.get(id)).toMatchObject({
        sentiment: null,
        sentiment_confidence: null,
        summary: null,
      })
    }
    // The number was read here: no model was asked about the scale question.
    expect(byResponse.get('r5')?.topics).toEqual(['4'])
    expect(seen.map((input) => input.mode).sort()).toEqual(['categorical', 'evaluative'])
    expect(seen.find((input) => input.mode === 'categorical')?.question).toBe(
      'Kegiatan paling seru?',
    )
  })

  it('records how each question was read before the summary is written', async () => {
    let atHook: Array<Record<string, unknown>> = []

    await runJob('job-1', {
      onResultsReady: async () => {
        atHook = [...jobUpdates]
      },
    })

    const recorded = atHook.find((values) => 'question_counts' in values)
    expect(recorded?.question_counts).toEqual({
      'q-kritik': { analyzed: 1, no_content: 1, failed: 0, mode: 'evaluative' },
      'q-seru': { analyzed: 2, no_content: 0, failed: 0, mode: 'categorical' },
      'q-puas': { analyzed: 1, no_content: 1, failed: 0, mode: 'scale' },
    })
    expect(recorded?.no_content_count).toBe(2)
    // And the job is not called finished until the summary has had its turn.
    expect(atHook.some((values) => values.status === 'succeeded')).toBe(false)
    expect(jobUpdates.at(-1)).toMatchObject({ status: 'succeeded', processed_count: 4 })
  })

  it('reads every question as evaluative on a prompt from before modes', async () => {
    promptVersion = 'analysis.v2'

    await runJob('job-1')

    expect(seen.every((input) => input.mode === 'evaluative')).toBe(true)
    const final = jobUpdates.at(-1)?.question_counts as Record<string, { mode: string }>
    expect(Object.values(final).map((counts) => counts.mode)).toEqual([
      'evaluative',
      'evaluative',
      'evaluative',
    ])
  })
})
