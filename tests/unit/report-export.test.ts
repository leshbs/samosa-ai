// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Analysis from '@/modules/analysis'
import type * as Reporting from '@/modules/reporting'
import { ERROR_CODES, appError, err, ok } from '@/modules/shared'
import { DEFAULT_REPORT_PREFERENCES } from '@/types/domain'

/**
 * The one place a report is assembled for the print page, the downloaded PDF
 * and the CSV. The aggregators it calls are tested on their own; what is
 * pinned here is the joining — which question a row lands under, which mode a
 * section is drawn in, and what the report says when a piece is missing.
 */

const getJob = vi.fn()
const listJobResults = vi.fn()
const getDataset = vi.fn()
const listQuestions = vi.fn()
const getStoredSummary = vi.fn()
const getPeople = vi.fn()

vi.mock('@/modules/analysis', async () => ({
  ...(await vi.importActual<typeof Analysis>('@/modules/analysis')),
  getJob,
  listJobResults,
}))
vi.mock('@/modules/reporting', async () => ({
  ...(await vi.importActual<typeof Reporting>('@/modules/reporting')),
  getStoredSummary,
}))
vi.mock('@/modules/ingestion', () => ({ getDataset, listQuestions }))
vi.mock('@/modules/auth', () => ({
  getPeople,
  getOrganizationSettings: vi.fn(),
  readOrganizationLogo: vi.fn(),
}))

const { citedQuotes, loadReportExport } = await import('@/app/api/_lib/report-data')
const { printableReport } = await import('@/modules/reporting')

const CONTEXT = {
  organizationId: 'org-1',
  organizationName: 'OSIS SMAN 1',
  timezone: 'Asia/Jakarta' as const,
  preferences: DEFAULT_REPORT_PREFERENCES,
  logo: null,
  preparedBy: null,
}

const JOB = {
  id: 'job-1',
  organizationId: 'org-1',
  datasetId: 'ds-1',
  status: 'succeeded',
  promptVersion: 'analysis.v3',
  modelId: 'gpt-4o-mini',
  processedCount: 4,
  totalCount: 5,
  failedCount: 0,
  noContentCount: 1,
  questionCounts: {
    'q-kritik': { analyzed: 2, noContent: 1, failed: 0, mode: 'evaluative' },
    'q-puas': { analyzed: 2, noContent: 0, failed: 0, mode: 'scale' },
  },
  topicMerges: {},
  inputTokens: 100,
  outputTokens: 50,
  costMicroIdr: 55_000_000,
  errorMessage: null,
  startedAt: '2026-10-03T01:00:00.000Z',
  finishedAt: '2026-10-03T01:00:25.000Z',
  createdBy: 'user-1',
  archivedAt: null,
  createdAt: '2026-10-03T00:59:58.000Z',
}

const QUESTIONS = [
  // The question says `thematic` today; the job read it as `evaluative`.
  { id: 'q-kritik', questionText: 'Kritik dan saran', analysisMode: 'thematic' },
  { id: 'q-puas', questionText: 'Seberapa puas? (1-5)', analysisMode: 'scale' },
]

const row = (
  responseId: string,
  questionId: string,
  respondentIndex: number,
  responseText: string,
  extra: Record<string, unknown> = {},
) => ({
  responseId,
  questionId,
  respondentIndex,
  responseText,
  sentiment: null,
  confidence: null,
  topics: [] as string[],
  rawTopics: [] as string[],
  keywords: [] as string[],
  summary: null,
  ...extra,
})

const ROWS = [
  row('r1', 'q-kritik', 1, 'Konsumsi telat dua jam', {
    sentiment: 'negative',
    confidence: 0.9,
    topics: ['konsumsi'],
    keywords: ['telat'],
  }),
  row('r2', 'q-puas', 1, '4', { topics: ['4'] }),
  row('r3', 'q-kritik', 2, 'Panitia ramah', {
    sentiment: 'positive',
    confidence: 0.8,
    topics: ['panitia'],
  }),
  row('r4', 'q-puas', 2, '5 bintang', { topics: ['5'] }),
]

beforeEach(() => {
  getJob.mockResolvedValue(ok(JOB))
  listJobResults.mockResolvedValue(ok(ROWS))
  getDataset.mockResolvedValue(ok({ id: 'ds-1', name: 'Evaluasi LDKS' }))
  listQuestions.mockResolvedValue(ok(QUESTIONS))
  getStoredSummary.mockResolvedValue({
    summary: 'Ringkasan.',
    insights: [{ title: 'Konsumsi', detail: 'Telat.', evidenceResponseIds: ['r1'] }],
  })
  getPeople.mockResolvedValue(
    new Map([['user-1', { displayName: 'Ayu', title: 'Sekretaris' }]]),
  )
})

async function load(options?: { includeArchived?: boolean }) {
  const result = await loadReportExport('job-1', CONTEXT, options)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('loadReportExport', () => {
  it('builds one section per question, in sheet order, each from its own rows', async () => {
    const { document, questions } = await load()

    expect(questions.map((question) => question.id)).toEqual(['q-kritik', 'q-puas'])
    expect(
      document.sections.map((section) => [section.questionText, section.answers]),
    ).toEqual([
      ['Kritik dan saran', 2],
      ['Seberapa puas? (1-5)', 2],
    ])
    expect(document.answers).toBe(4)
    // Topics are never pooled: "4" and "5" are not topics of the first question.
    expect(document.sections[0]?.topics.map((topic) => topic.term).sort()).toEqual([
      'konsumsi',
      'panitia',
    ])
  })

  it('says which labels a section counts as one topic, and prints it under the bars', async () => {
    getJob.mockResolvedValue(
      ok({
        ...JOB,
        topicMerges: {
          'q-kritik': { makanan: 'konsumsi', katering: 'konsumsi', mc: 'pembawa acara' },
        },
      }),
    )

    const { document } = await load()
    const [kritik, puas] = document.sections

    expect(kritik?.mergedTopics).toEqual([
      { term: 'konsumsi', from: ['katering', 'makanan'] },
      { term: 'pembawa acara', from: ['mc'] },
    ])
    expect(puas?.mergedTopics).toEqual([])

    const printable = printableReport(document)
    // Only the topics on the page: "pembawa acara" is not among this section's.
    expect(printable.sections[0]?.mergeNote).toBe(
      'Label yang menunjuk hal yang sama dihitung sebagai satu topik: konsumsi mencakup katering, makanan.',
    )
    // A number has no labels to merge.
    expect(printable.sections[1]?.mergeNote).toBeNull()
  })

  it('prints no merge note on a report whose job merged nothing', async () => {
    const { document } = await load()

    expect(printableReport(document).sections[0]?.mergeNote).toBeNull()
  })

  it('draws each section in the mode the job read it with', async () => {
    const { document } = await load()
    const [kritik, puas] = document.sections

    // Not the `thematic` the question carries now: the stored results have
    // sentiments, and the report must keep showing them.
    expect(kritik?.mode).toBe('evaluative')
    expect(kritik?.scale).toBeNull()
    expect(kritik?.sentiment.total).toBe(2)
    expect(kritik?.noContent).toBe(1)

    expect(puas?.mode).toBe('scale')
    expect(puas?.scale).toMatchObject({ mean: 4.5 })
    // Nothing was judged here, so there is no sentiment split to draw.
    expect(puas?.sentiment.total).toBe(0)
  })

  it('reads a job from before modes as evaluative throughout', async () => {
    getJob.mockResolvedValue(
      ok({ ...JOB, promptVersion: 'analysis.v2', questionCounts: {} }),
    )

    const { document } = await load()

    expect(document.sections.map((section) => section.mode)).toEqual([
      'evaluative',
      'evaluative',
    ])
  })

  it('says the non-answers were not counted, rather than zero, on analysis.v1', async () => {
    getJob.mockResolvedValue(
      ok({ ...JOB, promptVersion: 'analysis.v1', noContentCount: 0 }),
    )

    expect((await load()).document.noContent).toBeNull()
    getJob.mockResolvedValue(ok(JOB))
    expect((await load()).document.noContent).toBe(1)
  })

  it('names who ran it, what it cost, and whether it is archived', async () => {
    const live = await load()

    expect(live.archived).toBe(false)
    expect(live.document.provenance).toMatchObject({
      modelId: 'gpt-4o-mini',
      promptVersion: 'analysis.v3',
      analyzed: 4,
      failed: 0,
      runBy: 'Ayu · Sekretaris',
    })
    expect(live.document.provenance?.cost).toContain('55')

    getJob.mockResolvedValue(
      ok({ ...JOB, archivedAt: '2027-10-03', createdBy: null, costMicroIdr: 0 }),
    )
    const archived = await load({ includeArchived: true })

    expect(archived.archived).toBe(true)
    expect(archived.document.provenance).toMatchObject({ runBy: null, cost: null })
    expect(getJob).toHaveBeenLastCalledWith('org-1', 'job-1', { includeArchived: true })
  })

  it('still prints when the summary, the dataset or the questions are missing', async () => {
    getStoredSummary.mockResolvedValue(null)
    getDataset.mockResolvedValue(err(appError(ERROR_CODES.NOT_FOUND, 'gone')))
    listQuestions.mockResolvedValue(err(appError(ERROR_CODES.INTERNAL, 'timeout')))

    const { document } = await load()

    expect(document.summary).toBeNull()
    expect(document.insights).toEqual([])
    expect(document.datasetName).toBe('Dataset')
    // No row is dropped for want of a question to file it under.
    expect(document.sections.reduce((sum, section) => sum + section.answers, 0)).toBe(4)
  })

  it.each([
    [
      'the job',
      () => getJob.mockResolvedValue(err(appError(ERROR_CODES.NOT_FOUND, 'x'))),
    ],
    [
      'its results',
      () => listJobResults.mockResolvedValue(err(appError(ERROR_CODES.INTERNAL, 'x'))),
    ],
  ])('fails when %s cannot be read', async (_what, breakIt) => {
    breakIt()

    expect((await loadReportExport('job-1', CONTEXT)).ok).toBe(false)
  })

  it('refuses to export a job with no results instead of printing a blank report', async () => {
    listJobResults.mockResolvedValue(ok([]))

    const result = await loadReportExport('job-1', CONTEXT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ERROR_CODES.NOT_FOUND)
  })
})

describe('citedQuotes', () => {
  it('returns the text of the answers the insights cite, and no others', async () => {
    expect(citedQuotes(await load())).toEqual({ r1: 'Konsumsi telat dua jam' })
  })
})
