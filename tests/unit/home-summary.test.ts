import { describe, expect, it } from 'vitest'
import { buildHomeSummary, type HomeJob } from '@/modules/reporting'
import { formatShare } from '@/lib/utils'

const NOW = new Date('2026-09-27T10:00:00+07:00')
const TZ = 'Asia/Jakarta'

function job(overrides: Partial<HomeJob> & Pick<HomeJob, 'id'>): HomeJob {
  return {
    datasetName: `Dataset ${overrides.id}`,
    status: 'succeeded',
    processedCount: 100,
    totalCount: 100,
    costMicroIdr: 1_000_000,
    createdAt: '2026-09-20T03:00:00Z',
    finishedAt: '2026-09-20T03:05:00Z',
    ...overrides,
  }
}

function summarize(
  jobs: HomeJob[],
  positiveCounts: Record<string, number> = {},
  negativeCounts: Record<string, number> = {},
) {
  return buildHomeSummary({
    jobs,
    positiveCounts,
    negativeCounts,
    now: NOW,
    timeZone: TZ,
  })
}

describe('buildHomeSummary', () => {
  it('counts only succeeded and partial jobs as reports', () => {
    const summary = summarize([
      job({ id: 'a' }),
      job({ id: 'b', status: 'partial', processedCount: 40 }),
      job({ id: 'c', status: 'failed', processedCount: 0 }),
      job({ id: 'd', status: 'running', processedCount: 10 }),
    ])

    expect(summary.reportCount).toBe(2)
    expect(summary.analyzedTotal).toBe(140)
    expect(summary.runningCount).toBe(1)
  })

  it('reads "this month" in the reader\'s time zone, not UTC', () => {
    // 2026-08-31T20:00Z is already 1 September in Jakarta.
    const summary = summarize([
      job({ id: 'sept', createdAt: '2026-08-31T20:00:00Z', processedCount: 30 }),
      job({ id: 'aug', createdAt: '2026-08-31T10:00:00Z', processedCount: 50 }),
    ])

    expect(summary.analyzedThisMonth).toBe(30)
  })

  it('bills failed jobs in the monthly cost', () => {
    const summary = summarize([
      job({ id: 'ok', costMicroIdr: 2_000_000 }),
      job({ id: 'failed', status: 'failed', costMicroIdr: 500_000 }),
      job({ id: 'old', createdAt: '2026-07-01T00:00:00Z', costMicroIdr: 9_000_000 }),
    ])

    expect(summary.costThisMonthMicroIdr).toBe(2_500_000)
  })

  it('pools the positive average so large reports weigh more', () => {
    const summary = summarize(
      [job({ id: 'big', processedCount: 800 }), job({ id: 'small', processedCount: 20 })],
      { big: 400, small: 20 },
    )

    // Mean of shares would be (0.5 + 1) / 2 = 0.75; pooled is 420 / 820.
    expect(summary.positiveAverage).toBeCloseTo(420 / 820)
  })

  it('plots the trend oldest first and caps it', () => {
    const jobs = Array.from({ length: 8 }, (_, index) =>
      job({ id: `j${index}`, processedCount: 100 }),
    )
    const positive = Object.fromEntries(jobs.map((item, index) => [item.id, index * 10]))

    const summary = summarize(jobs, positive)

    // Newest six are j0..j5; reversed so the line reads left to right in time.
    expect(summary.positiveTrend).toEqual([0.5, 0.4, 0.3, 0.2, 0.1, 0])
  })

  it('leaves the average empty rather than inventing one', () => {
    const summary = summarize([job({ id: 'a' })])

    expect(summary.positiveAverage).toBeNull()
    expect(summary.positiveTrend).toEqual([])
    expect(summary.recent[0]?.positiveShare).toBeNull()
  })

  it('derives neutral as the remainder for the latest report', () => {
    const summary = summarize(
      [job({ id: 'latest', processedCount: 310 }), job({ id: 'older' })],
      { latest: 190, older: 50 },
      { latest: 45 },
    )

    expect(summary.latestReport?.job.id).toBe('latest')
    expect(summary.latestReport?.sentiment).toEqual({
      positive: 190,
      neutral: 75,
      negative: 45,
    })
  })

  it('refuses to draw a sentiment split from two of three numbers', () => {
    const summary = summarize([job({ id: 'latest' })], { latest: 60 })

    expect(summary.latestReport?.sentiment).toBeNull()
  })

  it('reports progress for running jobs and a share for finished ones', () => {
    const summary = summarize(
      [
        job({ id: 'run', status: 'running', processedCount: 45, totalCount: 180 }),
        job({ id: 'queued', status: 'queued', processedCount: 0, totalCount: 0 }),
        job({ id: 'done', processedCount: 200 }),
      ],
      { done: 56 },
    )

    const [running, queued, done] = summary.recent
    expect(running?.progress).toBe(0.25)
    expect(running?.positiveShare).toBeNull()
    expect(queued?.progress).toBe(0)
    expect(done?.progress).toBeNull()
    expect(done?.positiveShare).toBe(0.28)
  })

  it('shows five recent analyses at most', () => {
    const jobs = Array.from({ length: 9 }, (_, index) => job({ id: `j${index}` }))

    expect(summarize(jobs).recent).toHaveLength(5)
  })
})

describe('formatShare', () => {
  it('keeps one decimal below ten percent and rounds above', () => {
    expect(formatShare(0.081)).toBe('8,1%')
    expect(formatShare(0.78)).toBe('78%')
    expect(formatShare(0)).toBe('0%')
  })
})
