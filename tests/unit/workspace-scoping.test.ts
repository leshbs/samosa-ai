import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The audit behind ADR-0012, kept as a test.
 *
 * RLS admits every workspace a person belongs to, so once someone is in two, a
 * query that leans on RLS alone returns both workspaces' rows on one page.
 * Nothing at the database level can catch that — the rows are all rows the
 * caller may see. The only guard is that each query names the active
 * workspace, so every query that reads tenant data through the session client
 * is listed here and must filter on `organization_id`.
 *
 * A new query function belongs in this list. One that cannot pass is one that
 * would mix two workspaces.
 */

type Call = { table: string; filters: Record<string, unknown> }

const calls: Call[] = []

/** A postgrest builder that records its filters and resolves to nothing. */
function recorder(table: string) {
  const call: Call = { table, filters: {} }
  calls.push(call)

  const result = { data: [], error: null, count: 0 }
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'limit', 'range', 'delete']) {
    builder[method] = () => builder
  }
  for (const method of ['eq', 'in']) {
    builder[method] = (column: string, value: unknown) => {
      call.filters[column] = value
      return builder
    }
  }
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => recorder(table) }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => recorder(table) }),
}))

const jobs = await import('@/modules/analysis/services/job-queries')
const datasets = await import('@/modules/ingestion/services/dataset-queries')

const ORG = 'org-active'

const QUERIES: Array<[name: string, run: () => Promise<unknown>]> = [
  ['listJobs', () => jobs.listJobs(ORG)],
  ['listJobs (mine)', () => jobs.listJobs(ORG, { createdBy: 'user-1' })],
  ['getJob', () => jobs.getJob(ORG, 'job-1')],
  ['listJobResults', () => jobs.listJobResults(ORG, 'job-1')],
  ['getLatestJobForDataset', () => jobs.getLatestJobForDataset(ORG, 'dataset-1')],
  ['getUsageSummary', () => jobs.getUsageSummary(ORG)],
  ['countReports', () => jobs.countReports(ORG)],
  ['countResultsBySentiment', () => jobs.countResultsBySentiment(ORG, ['a'], 'positive')],
  ['listDatasets', () => datasets.listDatasets(ORG)],
  ['countDatasets', () => datasets.countDatasets(ORG)],
  ['getDataset', () => datasets.getDataset(ORG, 'dataset-1')],
  ['listResponses', () => datasets.listResponses(ORG, 'dataset-1')],
  ['listAllResponses', () => datasets.listAllResponses(ORG, 'dataset-1')],
  ['deleteDataset', () => datasets.deleteDataset(ORG, 'dataset-1')],
]

beforeEach(() => {
  calls.length = 0
})

describe('queries stay inside the active workspace', () => {
  it.each(QUERIES)('%s filters every table it reads', async (_name, run) => {
    await run()

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.filters, `query on ${call.table}`).toMatchObject({
        organization_id: ORG,
      })
    }
  })

  it('covers every query the two modules export', () => {
    const covered = new Set(QUERIES.map(([name]) => name.split(' ')[0]))
    const exported = [...Object.entries(jobs), ...Object.entries(datasets)]
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      // Runs in the background with the service role and no session; the job
      // id comes from the runner, never from a request.
      .filter((name) => name !== 'getJobSnapshot')

    expect(exported.filter((name) => !covered.has(name))).toEqual([])
  })
})
