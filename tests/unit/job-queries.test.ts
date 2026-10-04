// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_CODES } from '@/modules/shared'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

/**
 * What the pages read about a job. Two things here have broken before and are
 * pinned: a row from a database that is a migration behind must still load
 * (`toJob` tolerates missing columns), and results must come back whole — in
 * pages, with their text — however many there are.
 *
 * That every query names the active workspace is `workspace-scoping.test.ts`.
 */

const from = vi.fn()
const adminFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))

const {
  getJob,
  getJobSnapshot,
  getLatestJobForDataset,
  getUsageSummary,
  listJobResults,
  listJobs,
} = await import('@/modules/analysis/services/job-queries')

const ROW = {
  id: 'job-1',
  organization_id: 'org-1',
  dataset_id: 'ds-1',
  status: 'partial',
  prompt_version: 'analysis.v3',
  model_id: 'gpt-4o-mini',
  processed_count: 120,
  total_count: 140,
  failed_count: 12,
  no_content_count: 8,
  question_counts: {
    'q-1': { analyzed: 120, no_content: 8, failed: 12, mode: 'thematic' },
  },
  topic_merges: {
    prompt_version: 'merge.v1',
    questions: { 'q-1': { 'percaya diri': 'kepercayaan diri' } },
  },
  input_tokens: 9_000,
  output_tokens: 3_000,
  cost_micro_idr: 96_000,
  error_message: null,
  started_at: '2026-10-03T01:00:00.000Z',
  finished_at: '2026-10-03T01:00:25.000Z',
  created_by: 'user-1',
  archived_at: null,
  created_at: '2026-10-03T00:59:58.000Z',
}

/** Hands out one prepared query per `from()` call, in order. */
function queue(target: typeof from, ...queries: FakeQuery[]) {
  const pending = [...queries]
  target.mockImplementation(() => pending.shift())
}

/**
 * The same for `listJobResults`, which reads the job beside its results: the
 * job's row is answered by table, the pages of results in order.
 */
function queueResults(job: unknown, ...pages: FakeQuery[]) {
  const pending = [...pages]
  const jobQuery = fakeQuery({ data: job, error: null })
  from.mockImplementation((table: string) =>
    table === 'analysis_jobs' ? jobQuery : pending.shift(),
  )
  return jobQuery
}

const methods = (query: FakeQuery) => query.calls.map((call) => call.method)

beforeEach(() => {
  from.mockReset()
  adminFrom.mockReset()
})

describe('getJob', () => {
  it('reads a job row into the shape the pages use', async () => {
    queue(from, fakeQuery({ data: ROW, error: null }))

    const result = await getJob('org-1', 'job-1')

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'job-1',
        organizationId: 'org-1',
        datasetId: 'ds-1',
        status: 'partial',
        promptVersion: 'analysis.v3',
        modelId: 'gpt-4o-mini',
        processedCount: 120,
        totalCount: 140,
        failedCount: 12,
        noContentCount: 8,
        questionCounts: {
          'q-1': { analyzed: 120, noContent: 8, failed: 12, mode: 'thematic' },
        },
        topicMerges: { 'q-1': { 'percaya diri': 'kepercayaan diri' } },
        inputTokens: 9_000,
        outputTokens: 3_000,
        costMicroIdr: 96_000,
        errorMessage: null,
        startedAt: '2026-10-03T01:00:00.000Z',
        finishedAt: '2026-10-03T01:00:25.000Z',
        createdBy: 'user-1',
        archivedAt: null,
        createdAt: '2026-10-03T00:59:58.000Z',
      },
    })
  })

  it('loads a queued job from a database that is migrations behind', async () => {
    // No model yet, and none of the columns later migrations added.
    queue(
      from,
      fakeQuery({
        data: {
          id: 'job-2',
          organization_id: 'org-1',
          dataset_id: 'ds-1',
          status: 'queued',
          prompt_version: 'analysis.v1',
          model_id: null,
          created_at: '2026-09-20T00:00:00.000Z',
        },
        error: null,
      }),
    )

    const result = await getJob('org-1', 'job-2')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      modelId: '',
      processedCount: 0,
      noContentCount: 0,
      questionCounts: {},
      topicMerges: {},
      createdBy: null,
      archivedAt: null,
      startedAt: null,
    })
  })

  it('hides an archived job unless the caller asks for it', async () => {
    const hidden = fakeQuery({ data: null, error: null })
    const shown = fakeQuery({ data: { ...ROW, archived_at: '2027-10-03' }, error: null })
    queue(from, hidden, shown)

    const visible = await getJob('org-1', 'job-1')
    const exported = await getJob('org-1', 'job-1', { includeArchived: true })

    expect(argsOf(hidden, 'is')).toEqual(['archived_at', null])
    expect(visible.ok).toBe(false)
    expect(methods(shown)).not.toContain('is')
    expect(exported.ok && exported.value.archivedAt).toBe('2027-10-03')
  })

  it.each([
    ['no row', { data: null, error: null }],
    ['a failed read', { data: null, error: { message: 'timeout' } }],
  ])('answers not found for %s', async (_case, answer) => {
    queue(from, fakeQuery(answer))

    const result = await getJob('org-1', 'job-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.NOT_FOUND)
  })
})

describe('listJobs', () => {
  it('names the dataset of each job, and says when it is gone', async () => {
    const names = fakeQuery({
      data: [{ id: 'ds-1', name: 'Evaluasi LDKS' }],
      error: null,
    })
    queue(
      from,
      fakeQuery({
        data: [ROW, { ...ROW, id: 'job-2', dataset_id: 'ds-gone' }],
        error: null,
      }),
      names,
    )

    const result = await listJobs('org-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((job) => [job.id, job.datasetName])).toEqual([
      ['job-1', 'Evaluasi LDKS'],
      ['job-2', 'Dataset terhapus'],
    ])
    // Each dataset is asked for once, however many jobs it has.
    expect(argsOf(names, 'in')).toEqual(['id', ['ds-1', 'ds-gone']])
  })

  it('skips the dataset lookup when there are no jobs', async () => {
    queue(from, fakeQuery({ data: [], error: null }))

    const result = await listJobs('org-1')

    expect(result).toEqual({ ok: true, value: [] })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('lists newest first, fifty at most, without archived jobs', async () => {
    const jobs = fakeQuery({ data: [], error: null })
    queue(from, jobs)

    await listJobs('org-1')

    expect(argsOf(jobs, 'order')).toEqual(['created_at', { ascending: false }])
    expect(argsOf(jobs, 'limit')).toEqual([50])
    expect(argsOf(jobs, 'is')).toEqual(['archived_at', null])
  })

  it('narrows to one author and includes archived jobs when asked', async () => {
    const jobs = fakeQuery({ data: [], error: null })
    queue(from, jobs)

    await listJobs('org-1', { createdBy: 'user-1', limit: 5, includeArchived: true })

    expect(jobs.calls).toContainEqual({ method: 'eq', args: ['created_by', 'user-1'] })
    expect(argsOf(jobs, 'limit')).toEqual([5])
    expect(methods(jobs)).not.toContain('is')
  })

  it('reports a list that could not be read', async () => {
    queue(from, fakeQuery({ data: null, error: { message: 'timeout' } }))

    const result = await listJobs('org-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.INTERNAL)
  })
})

describe('listJobResults', () => {
  const result = (id: string, joined: unknown, extra: Record<string, unknown> = {}) => ({
    response_id: id,
    sentiment: 'negative',
    sentiment_confidence: 0.8,
    topics: ['konsumsi'],
    keywords: ['telat'],
    summary: 'Konsumsi telat.',
    responses: joined,
    ...extra,
  })

  it('puts each result next to the answer it describes, in sheet order', async () => {
    queueResults(
      // A job from before topics were merged.
      { ...ROW, topic_merges: {} },
      fakeQuery({
        data: [
          // PostgREST embeds a to-one relation as an object or as an array of
          // one, depending on how it reads the foreign key.
          result('r2', [{ text: 'Outbond', question_id: 'q-2', respondent_index: 7 }], {
            sentiment: null,
            sentiment_confidence: null,
            keywords: null,
            summary: null,
          }),
          result('r1', {
            text: 'Konsumsi telat',
            question_id: 'q-1',
            respondent_index: 3,
          }),
        ],
        error: null,
      }),
    )

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows).toEqual({
      ok: true,
      value: [
        {
          responseId: 'r1',
          questionId: 'q-1',
          respondentIndex: 3,
          responseText: 'Konsumsi telat',
          sentiment: 'negative',
          confidence: 0.8,
          topics: ['konsumsi'],
          rawTopics: ['konsumsi'],
          keywords: ['telat'],
          summary: 'Konsumsi telat.',
        },
        {
          responseId: 'r2',
          questionId: 'q-2',
          respondentIndex: 7,
          responseText: 'Outbond',
          // A choice was not read for sentiment: null, never a default label.
          sentiment: null,
          confidence: null,
          topics: ['konsumsi'],
          rawTopics: ['konsumsi'],
          keywords: [],
          summary: null,
        },
      ],
    })
  })

  it('reads topics through the merges the job recorded, question by question', async () => {
    const answer = (questionId: string, respondentIndex: number) => ({
      text: 't',
      question_id: questionId,
      respondent_index: respondentIndex,
    })
    const jobQuery = queueResults(
      ROW,
      fakeQuery({
        data: [
          result('r1', answer('q-1', 1), { topics: ['Percaya Diri', 'keberanian'] }),
          // Both labels of one merged topic on one answer: counted once.
          result('r2', answer('q-1', 2), {
            topics: ['kepercayaan diri', 'percaya diri'],
          }),
          // The same label under another question is another topic.
          result('r3', answer('q-2', 3), { topics: ['percaya diri'] }),
        ],
        error: null,
      }),
    )

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows.ok && rows.value.map((row) => row.topics)).toEqual([
      ['kepercayaan diri', 'keberanian'],
      ['kepercayaan diri'],
      ['percaya diri'],
    ])
    // What the model wrote is still there to be read.
    expect(rows.ok && rows.value.map((row) => row.rawTopics)).toEqual([
      ['Percaya Diri', 'keberanian'],
      ['kepercayaan diri', 'percaya diri'],
      ['percaya diri'],
    ])
    expect(argsOf(jobQuery, 'eq')).toEqual(['id', 'job-1'])
    expect(jobQuery.calls).toContainEqual({
      method: 'eq',
      args: ['organization_id', 'org-1'],
    })
  })

  it('returns the labels as they are when the job cannot be read', async () => {
    // A database without the column, or a job row RLS hides: no merges, and
    // still a report.
    queueResults(
      null,
      fakeQuery({
        data: [
          result(
            'r1',
            { text: 't', question_id: 'q-1', respondent_index: 1 },
            { topics: ['percaya diri'] },
          ),
        ],
        error: null,
      }),
    )

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows.ok && rows.value[0]?.topics).toEqual(['percaya diri'])
  })

  it('keeps a result whose answer could not be joined, with an empty text', async () => {
    queueResults(ROW, fakeQuery({ data: [result('r1', null)], error: null }))

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows.ok && rows.value[0]).toMatchObject({
      responseId: 'r1',
      responseText: '',
      questionId: '',
    })
  })

  it('reads past the first thousand rows', async () => {
    const page = (start: number, size: number) =>
      Array.from({ length: size }, (_, i) =>
        result(`r${start + i}`, {
          text: 't',
          question_id: 'q',
          respondent_index: start + i,
        }),
      )
    const first = fakeQuery({ data: page(0, 1_000), error: null })
    const second = fakeQuery({ data: page(1_000, 400), error: null })
    queueResults(ROW, first, second)

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows.ok && rows.value.length).toBe(1_400)
    expect(argsOf(first, 'range')).toEqual([0, 999])
    expect(argsOf(second, 'range')).toEqual([1_000, 1_999])
    // A stable order, or rows repeat and go missing between pages.
    expect(argsOf(first, 'order')).toEqual(['id', { ascending: true }])
  })

  it('reports results that could not be read instead of an empty report', async () => {
    queueResults(ROW, fakeQuery({ data: null, error: { message: 'timeout' } }))

    const rows = await listJobResults('org-1', 'job-1')

    expect(rows.ok).toBe(false)
    if (rows.ok) return
    expect(rows.error.code).toBe(ERROR_CODES.INTERNAL)
  })
})

describe('getLatestJobForDataset', () => {
  it('answers null, not an error, for a dataset never analysed', async () => {
    queue(from, fakeQuery({ data: null, error: null }))

    expect(await getLatestJobForDataset('org-1', 'ds-1')).toEqual({
      ok: true,
      value: null,
    })
  })

  it('returns the newest job', async () => {
    const latest = fakeQuery({ data: ROW, error: null })
    queue(from, latest)

    const result = await getLatestJobForDataset('org-1', 'ds-1')

    expect(result.ok && result.value?.id).toBe('job-1')
    expect(argsOf(latest, 'order')).toEqual(['created_at', { ascending: false }])
    expect(argsOf(latest, 'limit')).toEqual([1])
  })

  it('reports a failed read', async () => {
    queue(from, fakeQuery({ data: null, error: { message: 'timeout' } }))

    const result = await getLatestJobForDataset('org-1', 'ds-1')

    expect(result.ok).toBe(false)
  })
})

describe('getUsageSummary', () => {
  it('adds up what every job used', async () => {
    queue(
      from,
      fakeQuery({
        data: [
          {
            processed_count: 120,
            input_tokens: 9_000,
            output_tokens: 3_000,
            cost_micro_idr: 96_000,
          },
          {
            processed_count: 30,
            input_tokens: 1_000,
            output_tokens: 500,
            cost_micro_idr: 12_000,
          },
        ],
        error: null,
      }),
    )

    expect(await getUsageSummary('org-1')).toEqual({
      ok: true,
      value: {
        totalJobs: 2,
        responsesAnalyzed: 150,
        inputTokens: 10_000,
        outputTokens: 3_500,
        costMicroIdr: 108_000,
      },
    })
  })

  it('is all zeros for a workspace that has run nothing', async () => {
    queue(from, fakeQuery({ data: [], error: null }))

    const result = await getUsageSummary('org-1')

    expect(result.ok && result.value).toMatchObject({ totalJobs: 0, costMicroIdr: 0 })
  })

  it('reports a failed read instead of showing zero spent', async () => {
    queue(from, fakeQuery({ data: null, error: { message: 'timeout' } }))

    expect((await getUsageSummary('org-1')).ok).toBe(false)
  })
})

describe('getJobSnapshot', () => {
  it('describes a finished job for the email that follows it', async () => {
    queue(
      adminFrom,
      fakeQuery({ data: ROW, error: null }),
      fakeQuery({ data: { name: 'Evaluasi LDKS' }, error: null }),
      fakeQuery({
        data: { name: 'OSIS SMAN 1', timezone: 'Asia/Makassar' },
        error: null,
      }),
    )

    expect(await getJobSnapshot('job-1')).toEqual({
      jobId: 'job-1',
      organizationId: 'org-1',
      organizationName: 'OSIS SMAN 1',
      organizationTimezone: 'Asia/Makassar',
      datasetId: 'ds-1',
      datasetName: 'Evaluasi LDKS',
      status: 'partial',
      processedCount: 120,
      totalCount: 140,
      failedCount: 12,
      createdBy: 'user-1',
      finishedAt: '2026-10-03T01:00:25.000Z',
    })
    // The session client has no session in the background; it is never used.
    expect(from).not.toHaveBeenCalled()
  })

  it('still describes the job when its dataset or workspace is gone', async () => {
    queue(
      adminFrom,
      fakeQuery({ data: ROW, error: null }),
      fakeQuery({ data: null, error: null }),
      fakeQuery({ data: null, error: null }),
    )

    expect(await getJobSnapshot('job-1')).toMatchObject({
      datasetName: 'Dataset',
      organizationName: 'Organisasi',
      organizationTimezone: undefined,
    })
  })

  it('answers null for a job that does not exist', async () => {
    queue(adminFrom, fakeQuery({ data: null, error: null }))

    expect(await getJobSnapshot('nope')).toBeNull()
    expect(adminFrom).toHaveBeenCalledTimes(1)
  })
})
