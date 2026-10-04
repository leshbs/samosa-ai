// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ERROR_CODES,
  appError,
  err,
  ok,
  type AppError,
  type Result,
} from '@/modules/shared'
import type {
  BatchInput,
  BatchOutput,
  ConfirmInput,
  MergeInput,
  MergeOutput,
} from '@/modules/analysis/adapters/types'

/**
 * Every way a claimed job can end, and what the job row says afterwards.
 *
 * The rule under test: once `runJob` has claimed a job, the row must leave
 * `running` — as `succeeded`, `partial` or `failed` — whatever went wrong. A job
 * left at `running` shows a progress bar until the sweeper's daily pass, and
 * the person who started it is never told.
 */

const JOB = {
  id: 'job-1',
  organization_id: 'org-1',
  dataset_id: 'dataset-1',
  prompt_version: 'analysis.v3',
}
const QUESTIONS = [
  { id: 'q-kritik', question_text: 'Kritik dan saran', analysis_mode: 'evaluative' },
  { id: 'q-kesan', question_text: 'Apa kesanmu?', analysis_mode: 'thematic' },
]
const RESPONSES = [
  { id: 'r1', text: 'Konsumsi telat dua jam', question_id: 'q-kritik' },
  { id: 'r2', text: 'Panitianya ramah sekali', question_id: 'q-kritik' },
  { id: 'r3', text: 'Belajar kerja sama tim', question_id: 'q-kesan' },
]

type Answer = { data: unknown; error: { code?: string; message?: string } | null }

/** What the database answers; each test bends one of these. */
let db: {
  claim: Answer
  responses: Answer
  questions: Answer
  /** The head count `createJob` takes before queueing anything. */
  count: { count: number | null; error: Answer['error'] }
  insert: () => Promise<{ error: Answer['error'] }>
  update: (values: Record<string, unknown>) => Answer['error']
}
let jobUpdates: Array<Record<string, unknown>> = []
let inserted: Array<Record<string, unknown>> | null = null

function table(name: string) {
  let written: Record<string, unknown> | null = null

  const answer = (): Answer | typeof db.count => {
    if (name === 'dataset_questions') return db.questions
    if (name === 'responses') return db.count
    if (written?.status === 'running') return db.claim
    if (written) return { data: null, error: db.update(written) }
    return { data: null, error: null }
  }

  const builder = {
    update: (values: Record<string, unknown>) => {
      written = values
      if (name === 'analysis_jobs') jobUpdates.push(values)
      return builder
    },
    insert: async (rows: Array<Record<string, unknown>>) => {
      const outcome = await db.insert()
      if (!outcome.error) inserted = rows
      return outcome
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    range: async () => db.responses,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve()
        .then(() => answer())
        .then(resolve, reject),
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (name: string) => table(name) }),
}))

function analyzed(input: BatchInput): Result<BatchOutput, AppError> {
  return ok({
    items: input.texts.map((_text, index) => ({
      index,
      sentiment: input.mode === 'evaluative' ? ('negative' as const) : null,
      confidence: input.mode === 'evaluative' ? 0.9 : null,
      topics: ['konsumsi'],
      keywords: ['telat'],
      summary: 'Ringkasan.',
    })),
    modelId: 'stub-model',
    usage: { inputTokens: 100, outputTokens: 40 },
    costMicroIdr: 700,
  })
}

const analyzeBatch = vi.fn(async (input: BatchInput) => analyzed(input))

const MERGE_SPENT = {
  modelId: 'stub-model',
  usage: { inputTokens: 30, outputTokens: 5 },
  costMicroIdr: 90,
}
/** Proposes every label of a question as one group; confirms every pair. */
const mergeTopics = vi.fn(
  async (input: MergeInput): Promise<Result<MergeOutput, AppError>> =>
    ok({ groups: [[...input.topics]], ...MERGE_SPENT }),
)
const confirmMerges = vi.fn(async (input: ConfirmInput) =>
  ok({
    verdicts: input.pairs.map(([a, b]) => ({ a, b, same: true })),
    ...MERGE_SPENT,
  }),
)

vi.mock('@/modules/analysis/adapters/openai', () => ({
  createOpenAiAdapter: () => ({
    name: 'stub',
    summarize: vi.fn(),
    classifyColumns: vi.fn(),
    mergeTopics,
    confirmMerges,
    analyzeBatch,
  }),
}))

const { runJob, createJob, CRASHED_MESSAGE } =
  await import('@/modules/analysis/services/job-runner')

const lastUpdate = () => jobUpdates.at(-1) ?? {}
const statuses = () => jobUpdates.map((values) => values.status).filter(Boolean)

beforeEach(() => {
  db = {
    claim: { data: [JOB], error: null },
    responses: { data: RESPONSES, error: null },
    questions: { data: QUESTIONS, error: null },
    count: { count: 3, error: null },
    insert: async () => ({ error: null }),
    update: () => null,
  }
  jobUpdates = []
  inserted = null
  analyzeBatch.mockReset()
  analyzeBatch.mockImplementation(async (input: BatchInput) => analyzed(input))
  mergeTopics.mockClear()
  confirmMerges.mockClear()
})

describe('runJob, when everything works', () => {
  it('stores a row per answer and closes the job with what it cost', async () => {
    const result = await runJob('job-1')

    expect(result).toEqual({ ok: true, value: { analyzed: 3 } })
    expect(inserted).toHaveLength(3)
    expect(inserted?.[0]).toMatchObject({
      organization_id: 'org-1',
      job_id: 'job-1',
      prompt_version: 'analysis.v3',
      model_id: 'stub-model',
    })
    // Two questions, so two batches: tokens and cost are summed over both.
    expect(lastUpdate()).toMatchObject({
      status: 'succeeded',
      processed_count: 3,
      failed_count: 0,
      no_content_count: 0,
      input_tokens: 200,
      output_tokens: 80,
      cost_micro_idr: 1_400,
      model_id: 'stub-model',
    })
    expect(lastUpdate().finished_at).toEqual(expect.any(String))
    expect(statuses()).toEqual(['running', 'succeeded'])
  })

  it('writes progress as batches land, so the page is not stuck at zero', async () => {
    await runJob('job-1')

    const progress = jobUpdates.filter(
      (values) => 'processed_count' in values && !('status' in values),
    )
    expect(progress.length).toBe(2)
    expect(progress.at(-1)).toEqual({ processed_count: 3, total_count: 3 })
  })
})

describe('runJob, when the job cannot be started', () => {
  it('reports a claim the database refused, and touches nothing else', async () => {
    db.claim = { data: null, error: { message: 'connection lost' } }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.INTERNAL)
    expect(analyzeBatch).not.toHaveBeenCalled()
    // Not claimed, so not ours to fail: only the claim attempt was written.
    expect(statuses()).toEqual(['running'])
  })

  it('fails the job when its answers cannot be read', async () => {
    db.responses = { data: null, error: { message: 'timeout' } }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    expect(analyzeBatch).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({
      status: 'failed',
      error_message: 'Aspirasi di dataset tidak bisa dimuat',
    })
    expect(lastUpdate().finished_at).toEqual(expect.any(String))
  })

  it('fails the job when its questions cannot be read', async () => {
    db.questions = { data: null, error: { message: 'timeout' } }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    // Without the questions the modes are unknown; guessing would store
    // sentiments for a question that has none.
    expect(analyzeBatch).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({
      status: 'failed',
      error_message: 'Pertanyaan dataset tidak bisa dimuat',
    })
  })
})

describe('runJob, when the model fails', () => {
  it('keeps what landed and calls the job partial', async () => {
    analyzeBatch.mockImplementation(async (input: BatchInput) =>
      input.mode === 'thematic'
        ? err(appError(ERROR_CODES.UPSTREAM, 'rate limited'))
        : analyzed(input),
    )

    const result = await runJob('job-1')

    expect(result).toEqual({ ok: true, value: { analyzed: 2 } })
    expect(inserted?.map((row) => row.response_id).sort()).toEqual(['r1', 'r2'])
    expect(lastUpdate()).toMatchObject({
      status: 'partial',
      processed_count: 2,
      failed_count: 1,
      question_counts: {
        'q-kritik': { analyzed: 2, no_content: 0, failed: 0, mode: 'evaluative' },
        'q-kesan': { analyzed: 0, no_content: 0, failed: 1, mode: 'thematic' },
      },
    })
  })

  it('treats an adapter that throws like a batch that failed', async () => {
    analyzeBatch.mockImplementation(async (input: BatchInput) => {
      if (input.mode === 'thematic') throw new TypeError('fetch failed')
      return analyzed(input)
    })

    const result = await runJob('job-1')

    // One batch is lost, not the job: the other question's answers are kept.
    expect(result).toEqual({ ok: true, value: { analyzed: 2 } })
    expect(lastUpdate()).toMatchObject({ status: 'partial', failed_count: 1 })
  })

  it('fails the job, with the reason, when no batch came back', async () => {
    analyzeBatch.mockImplementation(async () =>
      err(appError(ERROR_CODES.UPSTREAM, 'Kunci API ditolak')),
    )

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    expect(inserted).toBeNull()
    expect(lastUpdate().status).toBe('failed')
    // The admin reads this on the job page; "gagal" alone fixes nothing.
    expect(String(lastUpdate().error_message)).toContain('Kunci API ditolak')
  })

  it('fails the job when every answer is a non-answer', async () => {
    db.responses = {
      data: [
        { id: 'r1', text: 'tidak ada', question_id: 'q-kritik' },
        { id: 'r2', text: '-', question_id: 'q-kritik' },
      ],
      error: null,
    }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.VALIDATION)
    expect(analyzeBatch).not.toHaveBeenCalled()
    expect(lastUpdate().status).toBe('failed')
  })
})

describe('runJob, when the database fails after the model answered', () => {
  it('fails the job when the results cannot be stored', async () => {
    db.insert = async () => ({ error: { code: '23505', message: 'duplicate key' } })

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    expect(statuses()).toEqual(['running', 'failed'])
    expect(lastUpdate().error_message).toBe('Hasil analisis tidak bisa disimpan')
  })

  it('fails the job when the client throws instead of answering', async () => {
    db.insert = async () => {
      throw new Error('socket hang up')
    }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.INTERNAL)
    // The point of the catch: not left at `running` for the sweeper.
    expect(statuses()).toEqual(['running', 'failed'])
    expect(lastUpdate().error_message).toBe(CRASHED_MESSAGE)
  })

  it('answers with an error, not a throw, even when failing the job fails too', async () => {
    db.insert = async () => {
      throw new Error('socket hang up')
    }
    db.update = (values) => {
      if (values.status === 'failed') throw new Error('socket hang up')
      return null
    }

    await expect(runJob('job-1')).resolves.toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.INTERNAL },
    })
  })

  it('does not claim a finished job when the final status was not saved', async () => {
    db.update = (values) =>
      values.status === 'succeeded' ? { code: '57014', message: 'timeout' } : null

    const result = await runJob('job-1')

    expect(inserted).toHaveLength(3)
    expect(result.ok).toBe(false)
    // The results are good, so the job is not marked failed over this.
    expect(statuses()).not.toContain('failed')
  })

  it('still runs the summary hook when the counts before it were not saved', async () => {
    db.update = (values) =>
      'question_counts' in values && !('status' in values)
        ? { code: '57014', message: 'timeout' }
        : null
    const onResultsReady = vi.fn(async () => undefined)

    const result = await runJob('job-1', { onResultsReady })

    expect(result.ok).toBe(true)
    expect(onResultsReady).toHaveBeenCalledWith({ organizationId: 'org-1' })
    expect(lastUpdate().status).toBe('succeeded')
  })
})

describe('runJob, merging topic labels', () => {
  /** The first question's two answers get two labels for one thing. */
  const twoSpellings = async (input: BatchInput) => {
    const reply = analyzed(input)
    if (reply.ok && input.mode === 'evaluative') {
      reply.value.items.forEach((item, index) => {
        item.topics = [index === 0 ? 'konsumsi' : 'makanan']
      })
    }
    return reply
  }
  const merges = () => jobUpdates.find((values) => 'topic_merges' in values)

  it('asks nothing when every question has one label', async () => {
    await runJob('job-1')

    expect(mergeTopics).not.toHaveBeenCalled()
    expect(merges()).toBeUndefined()
  })

  it('records which labels are counted as one, and leaves the stored results alone', async () => {
    analyzeBatch.mockImplementation(twoSpellings)

    const result = await runJob('job-1')

    expect(result.ok).toBe(true)
    // What the model said about each answer is stored as it said it.
    expect(inserted?.map((row) => row.topics)).toEqual([
      ['konsumsi'],
      ['makanan'],
      ['konsumsi'],
    ])
    expect(merges()).toEqual({
      topic_merges: {
        prompt_version: 'merge.v1',
        questions: { 'q-kritik': { makanan: 'konsumsi' } },
      },
    })
    expect(mergeTopics).toHaveBeenCalledTimes(1)
    expect(mergeTopics.mock.calls[0]?.[0]).toMatchObject({
      question: 'Kritik dan saran',
      topics: ['konsumsi', 'makanan'],
    })
  })

  it('records the merges before the summary is written', async () => {
    analyzeBatch.mockImplementation(twoSpellings)
    let recordedByThen = false

    await runJob('job-1', {
      onResultsReady: async () => {
        recordedByThen = merges() !== undefined
      },
    })

    // The summary quotes topic counts, and must quote the merged ones.
    expect(recordedByThen).toBe(true)
  })

  it('adds what the two merge calls cost to the job', async () => {
    analyzeBatch.mockImplementation(twoSpellings)

    await runJob('job-1')

    expect(lastUpdate()).toMatchObject({
      status: 'succeeded',
      input_tokens: 200 + 60,
      output_tokens: 80 + 10,
      cost_micro_idr: 1_400 + 180,
    })
  })

  it('finishes the job when the merge fails: unmerged topics are not a failed analysis', async () => {
    analyzeBatch.mockImplementation(twoSpellings)
    mergeTopics.mockResolvedValueOnce(err(appError(ERROR_CODES.UPSTREAM, 'down')))

    const result = await runJob('job-1')

    expect(result).toEqual({ ok: true, value: { analyzed: 3 } })
    expect(merges()).toBeUndefined()
    expect(lastUpdate()).toMatchObject({ status: 'succeeded', cost_micro_idr: 1_400 })
  })

  it('finishes the job when the merge call throws', async () => {
    analyzeBatch.mockImplementation(twoSpellings)
    mergeTopics.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await runJob('job-1')

    expect(result.ok).toBe(true)
    expect(statuses()).toEqual(['running', 'succeeded'])
  })

  it('finishes the job on a database that has no column for the merges', async () => {
    analyzeBatch.mockImplementation(twoSpellings)
    // Its own statement, so refusing it refuses nothing else.
    db.update = (values) =>
      'topic_merges' in values ? { code: 'PGRST204', message: 'no such column' } : null
    const onResultsReady = vi.fn(async () => undefined)

    const result = await runJob('job-1', { onResultsReady })

    expect(result.ok).toBe(true)
    expect(onResultsReady).toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({ status: 'succeeded', processed_count: 3 })
    expect('topic_merges' in lastUpdate()).toBe(false)
  })
})

describe('runJob and the summary hook', () => {
  it('finishes the job when the hook throws: no narrative is not no analysis', async () => {
    const result = await runJob('job-1', {
      onResultsReady: async () => {
        throw new Error('summary model down')
      },
    })

    expect(result).toEqual({ ok: true, value: { analyzed: 3 } })
    expect(lastUpdate().status).toBe('succeeded')
  })

  it('does not run the hook for a job that failed', async () => {
    db.insert = async () => ({ error: { message: 'disk full' } })
    const onResultsReady = vi.fn(async () => undefined)

    await runJob('job-1', { onResultsReady })

    expect(onResultsReady).not.toHaveBeenCalled()
  })
})

describe('createJob, before a job exists', () => {
  it('refuses a dataset with no answers', async () => {
    db.count = { count: 0, error: null }

    const result = await createJob({ organizationId: 'org-1', datasetId: 'dataset-1' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.VALIDATION)
    expect(inserted).toBeNull()
  })

  it('refuses to queue a job it could not size', async () => {
    db.count = { count: null, error: { message: 'timeout' } }

    const result = await createJob({ organizationId: 'org-1', datasetId: 'dataset-1' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    // Not VALIDATION: the dataset may be fine, the count is what failed.
    expect(result.error.code).toBe(ERROR_CODES.INTERNAL)
    expect(inserted).toBeNull()
  })
})
