import { isReportable, type JobStatus, type Sentiment } from '@/types/domain'

/**
 * Everything the home page states as a number, computed in one place so the
 * page only formats. Pure and free of database access, like the report
 * aggregators beside it: the counts arrive as arguments.
 */

/** The slice of an analysis job the home page reads. Structural on purpose. */
export type HomeJob = {
  id: string
  datasetName: string
  status: JobStatus
  processedCount: number
  totalCount: number
  costMicroIdr: number
  createdAt: string
  finishedAt: string | null
}

/** design_system.md §10.2: five rows, then "Lihat semua". */
export const RECENT_LIMIT = 5

/** Reports plotted in the positive-sentiment sparkline. */
export const TREND_POINTS = 6

export type RecentAnalysis = {
  job: HomeJob
  /** Positive share of this report; null when there is no report yet. */
  positiveShare: number | null
  /** 0–1 while queued or running; null once the job has stopped. */
  progress: number | null
}

export type LatestReport = {
  job: HomeJob
  /**
   * Null when either count is missing. A three-way bar drawn from two of the
   * three numbers would be wrong, not partial.
   */
  sentiment: Record<Sentiment, number> | null
}

export type HomeSummary = {
  reportCount: number
  runningCount: number
  analyzedTotal: number
  analyzedThisMonth: number
  costThisMonthMicroIdr: number
  /** Positive share per report, oldest first — the sparkline's x axis is time. */
  positiveTrend: number[]
  /**
   * Pooled over the trend's reports, not a mean of their shares: a 20-response
   * survey must not weigh as much as an 800-response one.
   */
  positiveAverage: number | null
  recent: RecentAnalysis[]
  latestReport: LatestReport | null
}

export type HomeSummaryInput = {
  /** Newest first, as the job list returns them. */
  jobs: readonly HomeJob[]
  positiveCounts: Readonly<Record<string, number>>
  negativeCounts: Readonly<Record<string, number>>
  now: Date
  /** "This month" is the reader's month, not the server's (UTC on Vercel). */
  timeZone: string
}

const ACTIVE: readonly JobStatus[] = ['queued', 'running']

function monthKey(value: Date, timeZone: string): string {
  // en-CA formats year-month as "2026-09", which compares as a plain string.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).format(value)
}

function positiveShareOf(job: HomeJob, positive: HomeSummaryInput['positiveCounts']) {
  const count = positive[job.id]
  if (!isReportable(job.status) || count === undefined || job.processedCount <= 0) {
    return null
  }
  return count / job.processedCount
}

function progressOf(job: HomeJob): number | null {
  if (!ACTIVE.includes(job.status)) return null
  if (job.totalCount <= 0) return 0
  return Math.min(1, job.processedCount / job.totalCount)
}

function latestReportOf(
  reports: readonly HomeJob[],
  { positiveCounts, negativeCounts }: HomeSummaryInput,
): LatestReport | null {
  const job = reports[0]
  if (!job) return null

  const positive = positiveCounts[job.id]
  const negative = negativeCounts[job.id]
  if (positive === undefined || negative === undefined) return { job, sentiment: null }

  // The runner stores exactly `processedCount` results, so neutral is the rest.
  const neutral = Math.max(0, job.processedCount - positive - negative)
  return { job, sentiment: { positive, neutral, negative } }
}

function trendOf(
  reports: readonly HomeJob[],
  positive: HomeSummaryInput['positiveCounts'],
) {
  const plotted = reports
    .slice(0, TREND_POINTS)
    .filter((job) => positiveShareOf(job, positive) !== null)

  const pooledTotal = plotted.reduce((sum, job) => sum + job.processedCount, 0)
  const pooledPositive = plotted.reduce((sum, job) => sum + (positive[job.id] ?? 0), 0)

  return {
    trend: plotted.map((job) => positiveShareOf(job, positive) ?? 0).reverse(),
    average: pooledTotal > 0 ? pooledPositive / pooledTotal : null,
  }
}

export function buildHomeSummary(input: HomeSummaryInput): HomeSummary {
  const { jobs, positiveCounts, now, timeZone } = input
  const thisMonth = monthKey(now, timeZone)
  const inThisMonth = (job: HomeJob) =>
    monthKey(new Date(job.createdAt), timeZone) === thisMonth

  const reports = jobs.filter((job) => isReportable(job.status))
  const { trend, average } = trendOf(reports, positiveCounts)

  return {
    reportCount: reports.length,
    runningCount: jobs.filter((job) => ACTIVE.includes(job.status)).length,
    analyzedTotal: reports.reduce((sum, job) => sum + job.processedCount, 0),
    analyzedThisMonth: reports
      .filter(inThisMonth)
      .reduce((sum, job) => sum + job.processedCount, 0),
    // Every job created this month, failed ones included: they were billed too.
    costThisMonthMicroIdr: jobs
      .filter(inThisMonth)
      .reduce((sum, job) => sum + job.costMicroIdr, 0),
    positiveTrend: trend,
    positiveAverage: average,
    recent: jobs.slice(0, RECENT_LIMIT).map((job) => ({
      job,
      positiveShare: positiveShareOf(job, positiveCounts),
      progress: progressOf(job),
    })),
    latestReport: latestReportOf(reports, input),
  }
}
