import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { DownloadPdfButton } from '@/components/reports/download-pdf-button'
import { StatusIndicator } from '@/components/ui/status-indicator'
import type { JobStatus } from '@/types/domain'

/**
 * §6.1. The one element the design system allows to be sticky, and the reason it
 * allows it: this page is long, and the export buttons are what someone came for.
 * Scrolling to the bottom of a 300-row explorer to find "Unduh PDF" is the
 * interaction this replaces.
 *
 * Solid background, not the translucent blur the app header used — §4 rules out
 * glassmorphism, and over a chart a blurred header is genuinely hard to read.
 *
 * It sticks at `top-0`: the shell has no top bar (the mobile menu bar scrolls
 * away), and any larger offset pushes the header down over the page's first
 * section while it is still in flow. The negative margins bleed it to the
 * shell's padding, so they must match `app-shell.tsx`.
 *
 * `data-print="static"` un-sticks it for print, where a fixed header repeats on
 * every page.
 */
export function ReportHeader({
  jobId,
  datasetId,
  datasetName,
  status,
  totalResponses,
  noContent,
  canExport,
}: {
  jobId: string
  datasetId: string
  datasetName: string
  status: JobStatus
  totalResponses: number
  /** Respondents who gave no aspiration; null when the job did not count them. */
  noContent: number | null
  /** §5: an action the role cannot take is absent, not disabled. */
  canExport: boolean
}) {
  return (
    <header
      data-print="static"
      className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 pb-4 pt-4 md:-mx-6 md:px-6 xl:-mx-10 xl:px-10"
    >
      <div className="mx-auto max-w-wide space-y-3">
        <Breadcrumb data-print="hide">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/reports">Laporan</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/datasets/${datasetId}`}>{datasetName}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Laporan aspirasi</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-xl font-semibold md:text-2xl">
                Laporan aspirasi
              </h1>
              <StatusIndicator status={status} size="sm" />
            </div>
            <p className="text-sm text-muted-foreground">
              {noContent
                ? `${totalResponses} dari ${totalResponses + noContent} responden memberikan aspirasi · ${datasetName}`
                : `${totalResponses} aspirasi dianalisis dari ${datasetName}`}
            </p>
          </div>

          {canExport ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2" data-print="hide">
              {/* A plain link, not fetch(): a GET that returns a file is already
                  a download, and routing it through JavaScript only adds a way
                  to fail. */}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/${jobId}/csv`} download>
                  <Download aria-hidden />
                  CSV
                </a>
              </Button>
              {/* The print page: for paper, and what "Unduh PDF" falls back to. */}
              <Button asChild variant="outline" size="sm">
                <Link href={`/reports/${jobId}/print`}>
                  <Printer aria-hidden />
                  Cetak
                </Link>
              </Button>
              <DownloadPdfButton jobId={jobId} />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
