import { ArrowRight, ChevronRight, FileBarChart2 } from 'lucide-react'
import Link from 'next/link'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { formatPercent, formatShare } from '@/lib/utils'
import type { RecentAnalysis } from '@/modules/reporting'
import { isReportable } from '@/types/domain'

const DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
})

/**
 * A job with a report opens the report; anything else opens its progress page,
 * which is also where a failure explains itself.
 */
function hrefFor({ job }: RecentAnalysis): string {
  return isReportable(job.status) ? `/reports/${job.id}` : `/analysis/${job.id}`
}

/** The one number a row can honestly show for its state — labelled, never bare. */
function Figure({ item }: { item: RecentAnalysis }) {
  if (item.positiveShare !== null) {
    return (
      <>
        <span className="text-teal-700 dark:text-teal-300">
          {formatShare(item.positiveShare)}
        </span>{' '}
        <span className="text-muted-foreground">positif</span>
      </>
    )
  }
  if (item.progress !== null) {
    return (
      <>
        <span className="text-foreground">{formatPercent(item.progress)}</span>{' '}
        <span className="text-muted-foreground">diproses</span>
      </>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

/**
 * design_system.md §10.2: rows divided by ink-200 rules, not cards — five of
 * them at most. Each row is one link, so the whole row is the target and the
 * keyboard stops once per analysis.
 */
export function RecentAnalyses({ items }: { items: readonly RecentAnalysis[] }) {
  return (
    <Stagger className="border-y">
      <ul className="divide-y">
        {items.map((item) => {
          const { job } = item
          const count = isReportable(job.status) ? job.processedCount : job.totalCount

          return (
            <li key={job.id}>
              <StaggerItem>
                <Link
                  href={hrefFor(item)}
                  className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-4 transition-colors duration-fast hover:bg-ember-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.03]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                    <FileBarChart2 aria-hidden className="size-[18px]" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {job.datasetName}
                    </span>
                    <span className="block font-mono text-micro text-muted-foreground">
                      {DATE.format(new Date(job.finishedAt ?? job.createdAt))}
                      <span className="sm:hidden">
                        {' · '}
                        {count.toLocaleString('id-ID')} respons
                      </span>
                    </span>
                  </span>

                  <span className="hidden w-28 text-right font-mono text-mono-data text-ink-600 dark:text-muted-foreground sm:block">
                    {count.toLocaleString('id-ID')} respons
                  </span>
                  <span className="hidden w-28 text-right font-mono text-mono-data md:block">
                    <Figure item={item} />
                  </span>
                  <StatusIndicator status={job.status} size="sm" />
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-400 transition-transform duration-fast group-hover:translate-x-0.5"
                  />
                </Link>
              </StaggerItem>
            </li>
          )
        })}
      </ul>
    </Stagger>
  )
}

export function RecentAnalysesHeading({ seeAllHref }: { seeAllHref: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Ruang kerja kamu</p>
        <h2 id="recent-title" className="text-h2">
          Analisis terbaru
        </h2>
      </div>
      <Link
        href={seeAllHref}
        className="inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Lihat semua
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  )
}
