// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The failure these cover: `after()` gives no delivery guarantee, so the same
 * job can be started twice — a retried webhook arriving while the first run is
 * still working. Before the guard, both runs reached the results insert, the
 * second collided with `unique (job_id, response_id)`, and the collision
 * handler marked a job that was about to succeed as failed.
 *
 * A job is claimed by compare-and-swap, so these assert on the shape of that
 * statement: the update must be filtered by `status = 'queued'`, and a claim
 * that matches no row must stop the run rather than continue.
 */

const update = vi.fn()
const select = vi.fn()
const eq = vi.fn()
const lt = vi.fn()
const maybeSingle = vi.fn()

/** Records every filter applied, so a test can assert the guard is present. */
type Recorded = { table: string; values?: Record<string, unknown>; filters: string[] }
let calls: Recorded[] = []

function builderFor(table: string, resolve: () => { data: unknown; error: unknown }) {
  const record: Recorded = { table, filters: [] }
  calls.push(record)

  const builder = {
    update: (values: Record<string, unknown>) => {
      record.values = values
      update(table, values)
      return builder
    },
    select: (columns?: string) => {
      select(table, columns)
      // `.select()` closes an update: it is the statement's result.
      return record.values ? Promise.resolve(resolve()) : builder
    },
    eq: (column: string, value: unknown) => {
      record.filters.push(`${column}=${String(value)}`)
      eq(table, column, value)
      return builder
    },
    lt: (column: string, value: unknown) => {
      record.filters.push(`${column}<${String(value)}`)
      lt(table, column, value)
      return builder
    },
    maybeSingle: () => {
      maybeSingle(table)
      return Promise.resolve(resolve())
    },
    order: () => builder,
    // The paged read of a dataset's responses. It fails here on purpose: a run
    // that got past the guard must stop before it reaches the model.
    range: () =>
      Promise.resolve(
        table === 'responses'
          ? { data: null, error: { message: 'responses unavailable' } }
          : resolve(),
      ),
  }
  return builder
}

let claimResult: { data: unknown; error: unknown }
let readbackResult: { data: unknown; error: unknown }

const from = vi.fn((table: string) => {
  // The first analysis_jobs call in runJob is the claim; a second is the
  // read-back that explains why the claim failed.
  const isClaim = !calls.some((call) => call.table === table && call.values)
  return builderFor(table, () => (isClaim ? claimResult : readbackResult))
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

const { runJob } = await import('@/modules/analysis/services/job-runner')
const { sweepStuckJobs, STUCK_AFTER_MS, STUCK_JOB_MESSAGE } =
  await import('@/modules/analysis/services/stuck-job-sweeper')

beforeEach(() => {
  calls = []
  from.mockClear()
  update.mockClear()
  select.mockClear()
  eq.mockClear()
  lt.mockClear()
  maybeSingle.mockClear()
  claimResult = { data: [], error: null }
  readbackResult = { data: null, error: null }
})

describe('runJob status guard', () => {
  it('claims the job only while it is still queued', async () => {
    // Claim succeeds, so the run proceeds past the guard and fails later at
    // the responses read — which is fine; the guard is what is under test.
    claimResult = {
      data: [
        {
          id: 'job-1',
          organization_id: 'org-1',
          dataset_id: 'dataset-1',
          prompt_version: 'analysis.v1',
        },
      ],
      error: null,
    }

    await runJob('job-1')

    const claim = calls.find((call) => call.table === 'analysis_jobs' && call.values)
    expect(claim?.values?.status).toBe('running')
    // Without this filter two concurrent runs both win the claim.
    expect(claim?.filters).toContain('status=queued')
    expect(claim?.filters).toContain('id=job-1')
  })

  it('refuses a second run of a job already taken, without touching results', async () => {
    claimResult = { data: [], error: null }
    readbackResult = { data: { status: 'running' }, error: null }

    const result = await runJob('job-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CONFLICT')
    // The collision that used to flip a healthy job to failed happened here.
    expect(from).not.toHaveBeenCalledWith('analysis_results')
  })

  it.each(['succeeded', 'partial', 'failed', 'cancelled'])(
    'does not re-run a job that is already %s',
    async (status) => {
      claimResult = { data: [], error: null }
      readbackResult = { data: { status }, error: null }

      const result = await runJob('job-1')

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('CONFLICT')
      expect(from).not.toHaveBeenCalledWith('analysis_results')
    },
  )

  it('still reports a missing job as not found', async () => {
    claimResult = { data: [], error: null }
    readbackResult = { data: null, error: null }

    const result = await runJob('does-not-exist')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_FOUND')
  })
})

describe('sweepStuckJobs', () => {
  it('fails only running jobs older than the cutoff', async () => {
    claimResult = { data: [{ id: 'job-1' }, { id: 'job-2' }], error: null }
    const now = new Date('2026-09-25T12:00:00.000Z')

    const result = await sweepStuckJobs(now)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sweptJobIds).toEqual(['job-1', 'job-2'])

    const sweep = calls.find((call) => call.values)
    expect(sweep?.values?.status).toBe('failed')
    expect(sweep?.values?.error_message).toBe(STUCK_JOB_MESSAGE)
    // Both filters matter: status alone would fail a healthy running job.
    expect(sweep?.filters).toContain('status=running')
    expect(sweep?.filters).toContain(
      `started_at<${new Date(now.getTime() - STUCK_AFTER_MS).toISOString()}`,
    )
  })

  it('leaves a job that has not yet passed the cutoff alone', async () => {
    // Nothing matched the window, which is the healthy steady state.
    claimResult = { data: [], error: null }

    const result = await sweepStuckJobs(new Date('2026-09-25T12:00:00.000Z'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sweptJobIds).toEqual([])
  })

  it('gives the sweeper a wider margin than the route can run for', () => {
    // maxDuration on the analysis route is 300s; sweeping sooner than that
    // would fail jobs that are merely slow.
    expect(STUCK_AFTER_MS).toBeGreaterThan(300 * 1000)
  })

  it('reports a failed sweep instead of pretending it swept nothing', async () => {
    claimResult = { data: null, error: { message: 'connection lost' } }

    const result = await sweepStuckJobs()

    expect(result.ok).toBe(false)
  })
})
