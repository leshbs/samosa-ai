import { FileBarChart2 } from 'lucide-react'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { type MockupReport } from '@/components/dashboard/banner-mockup'
import { Greeting } from '@/components/dashboard/greeting'
import { HeroBanner } from '@/components/dashboard/hero-banner'
import { KpiRow } from '@/components/dashboard/kpi-row'
import {
  RecentAnalyses,
  RecentAnalysesHeading,
} from '@/components/dashboard/recent-analyses'
import { EmptyState } from '@/components/layout/empty-state'
import { InlineError } from '@/components/layout/inline-error'
import { MAX_COUNTED_JOBS, countResultsBySentiment, listJobs } from '@/modules/analysis'
import { can, getSessionUser } from '@/modules/auth'
import {
  buildHomeSummary,
  getStoredSummary,
  type HomeSummary,
  type LatestReport,
} from '@/modules/reporting'
import { isReportable } from '@/types/domain'

export const metadata: Metadata = { title: 'Beranda' }

/**
 * The people using this are in Indonesia and the server is not. WIB covers the
 * majority; "this month" and today's date both follow it.
 */
const TIME_ZONE = 'Asia/Jakarta'

const LONG_DATE = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const SHORT_DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

/** Clearly a sample; shown until the organization has a report of its own. */
const EXAMPLE_REPORT: MockupReport = {
  href: null,
  name: 'Evaluasi Pensi 2026',
  dateLabel: '22 Agu 2026',
  analyzed: 310,
  sentiment: { positive: 189, neutral: 76, negative: 45 },
  excerpt:
    'Mayoritas siswa puas dengan lineup, tetapi antrean masuk dan jumlah tempat sampah perlu dibenahi sebelum acara berikutnya.',
}

const EXCERPT_LENGTH = 180

/** The summary's first sentence, so the card reads as a finding, not a teaser. */
function excerptOf(summary: string | null | undefined): string | null {
  const text = summary?.trim()
  if (!text) return null
  const first = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? text
  return first.length > EXCERPT_LENGTH ? `${first.slice(0, EXCERPT_LENGTH - 1)}…` : first
}

function mockupFrom(latest: LatestReport | null, summary: string | null): MockupReport {
  if (!latest) return EXAMPLE_REPORT
  const { job } = latest
  return {
    href: `/reports/${job.id}`,
    name: job.datasetName,
    dateLabel: SHORT_DATE.format(new Date(job.finishedAt ?? job.createdAt)),
    analyzed: job.processedCount,
    sentiment: latest.sentiment,
    excerpt: excerptOf(summary),
  }
}

function sublineFor(summary: HomeSummary | null): string {
  if (summary && summary.runningCount > 0) {
    return `${summary.runningCount} analisis sedang berjalan — progresnya ada di daftar di bawah.`
  }
  if (summary && summary.reportCount > 0) return 'Ubah aspirasi jadi keputusan.'
  return 'Mulai dari ekspor Google Forms — satu file CSV atau Excel sudah cukup.'
}

export default async function DashboardHomePage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')
  const { organizationId } = session.value
  const jobs = await listJobs(organizationId)

  const items = jobs.ok ? jobs.value : []
  const reports = items
    .filter((job) => isReportable(job.status))
    .slice(0, MAX_COUNTED_JOBS)
  const latest = reports[0]

  // Second wave, in parallel: the numerators for positive share, the one
  // negative count the latest report's split needs, and its stored summary.
  const [positive, negative, stored] = await Promise.all([
    countResultsBySentiment(
      organizationId,
      reports.map((job) => job.id),
      'positive',
    ),
    countResultsBySentiment(organizationId, latest ? [latest.id] : [], 'negative'),
    latest ? getStoredSummary(organizationId, latest.id) : Promise.resolve(null),
  ])

  const summary = jobs.ok
    ? buildHomeSummary({
        jobs: items,
        positiveCounts: positive.ok ? positive.value : {},
        negativeCounts: negative.ok ? negative.value : {},
        now: new Date(),
        timeZone: TIME_ZONE,
      })
    : null

  const canCreate = can(session.value.role, 'dataset:create')
  const firstName = session.ok
    ? (session.value.displayName.trim().split(/\s+/)[0] ?? '') || null
    : null

  const bannerAction = canCreate
    ? { label: 'Analisis feedback kamu', href: '/datasets/new' }
    : { label: 'Buka laporan', href: '/reports' }

  return (
    <div className="space-y-12">
      <Greeting
        dateLabel={LONG_DATE.format(new Date())}
        firstName={firstName}
        subline={sublineFor(summary)}
        canCreate={canCreate}
      />

      {summary && summary.reportCount > 0 ? <KpiRow summary={summary} /> : null}

      <HeroBanner
        report={mockupFrom(summary?.latestReport ?? null, stored?.summary ?? null)}
        action={bannerAction}
      />

      <section aria-labelledby="recent-title" className="space-y-5">
        <RecentAnalysesHeading seeAllHref="/analysis" />
        {!jobs.ok ? (
          <InlineError what={jobs.error.message} />
        ) : summary && summary.recent.length > 0 ? (
          <RecentAnalyses items={summary.recent} />
        ) : (
          <EmptyState
            icon={FileBarChart2}
            title="Belum ada analisis"
            description="Unggah ekspor Google Forms dalam format CSV atau Excel, lalu jalankan analisis — hasilnya muncul di sini."
            action={
              canCreate ? { label: 'Unggah dataset', href: '/datasets/new' } : undefined
            }
            actionVariant="outline"
          />
        )}
      </section>
    </div>
  )
}
