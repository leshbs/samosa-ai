import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shell and the home page count things on every render, so these queries
 * are HEAD counts that transfer no rows. The tests pin that down, and pin the
 * all-or-nothing rule for sentiment counts: an average computed from some of
 * the reports would look right and be wrong.
 */

type CountResult = { count: number | null; error: unknown }

const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))

const { countResultsBySentiment, countReports, MAX_COUNTED_JOBS } =
  await import('@/modules/analysis/services/job-queries')
const { countDatasets } = await import('@/modules/ingestion/services/dataset-queries')

/** Mimics the postgrest builder: select().eq().in() chain, awaited at the end. */
function countBuilder(resolve: (filters: Record<string, unknown>) => CountResult) {
  const filters: Record<string, unknown> = {}
  const builder = {
    select: vi.fn((_columns: string, options: unknown) => {
      filters.options = options
      return builder
    }),
    eq: (column: string, value: unknown) => {
      filters[column] = value
      return builder
    },
    in: (column: string, values: unknown) => {
      filters[column] = values
      return builder
    },
    then: (onFulfilled: (value: CountResult) => unknown) =>
      Promise.resolve(resolve(filters)).then(onFulfilled),
  }
  return builder
}

beforeEach(() => {
  from.mockReset()
})

describe('countResultsBySentiment', () => {
  it('counts per job without fetching rows', async () => {
    const builders: ReturnType<typeof countBuilder>[] = []
    from.mockImplementation(() => {
      const builder = countBuilder((filters) => ({
        count: filters.job_id === 'a' ? 12 : 30,
        error: null,
      }))
      builders.push(builder)
      return builder
    })

    const result = await countResultsBySentiment('org-1', ['a', 'b'], 'positive')

    expect(result).toEqual({ ok: true, value: { a: 12, b: 30 } })
    expect(from).toHaveBeenCalledWith('analysis_results')
    for (const builder of builders) {
      expect(builder.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    }
  })

  it('fails whole when any one count fails', async () => {
    from.mockImplementation(() =>
      countBuilder((filters) =>
        filters.job_id === 'b'
          ? { count: null, error: { message: 'timeout' } }
          : { count: 5, error: null },
      ),
    )

    const result = await countResultsBySentiment('org-1', ['a', 'b'], 'negative')

    expect(result.ok).toBe(false)
  })

  it('makes no request for no jobs, and caps a long list', async () => {
    from.mockImplementation(() => countBuilder(() => ({ count: 1, error: null })))

    expect(await countResultsBySentiment('org-1', [], 'positive')).toEqual({
      ok: true,
      value: {},
    })
    expect(from).not.toHaveBeenCalled()

    const ids = Array.from({ length: MAX_COUNTED_JOBS + 3 }, (_, index) => `j${index}`)
    await countResultsBySentiment('org-1', [...ids, 'j0'], 'positive')
    expect(from).toHaveBeenCalledTimes(MAX_COUNTED_JOBS)
  })
})

describe('shell counts', () => {
  it('counts only jobs that have a report', async () => {
    let seen: Record<string, unknown> = {}
    from.mockImplementation(() =>
      countBuilder((filters) => {
        seen = filters
        return { count: 4, error: null }
      }),
    )

    const result = await countReports('org-1')

    expect(result).toEqual({ ok: true, value: 4 })
    expect(from).toHaveBeenCalledWith('analysis_jobs')
    expect(seen.status).toEqual(['succeeded', 'partial'])
  })

  it('surfaces a failed dataset count as an error, not as zero', async () => {
    from.mockImplementation(() =>
      countBuilder(() => ({ count: null, error: { message: 'down' } })),
    )

    const result = await countDatasets('org-1')

    expect(result.ok).toBe(false)
  })
})
