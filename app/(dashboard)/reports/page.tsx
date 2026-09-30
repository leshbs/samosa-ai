import { ArrowRight, FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/layout/empty-state'
import { InlineError } from '@/components/layout/inline-error'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime } from '@/lib/utils'
import { organizationTimezone } from '../_lib/timezone'
import { listJobs } from '@/modules/analysis'
import type { JobStatus } from '@/types/domain'

export const metadata: Metadata = { title: 'Laporan' }

/**
 * A report is a view over a finished job, so this list is the job list minus
 * the runs that have nothing to show. `partial` earns its place: some batches
 * failed, but the aspirations that did come back are still worth reading, and
 * the report says so at the top.
 */
const REPORTABLE: readonly JobStatus[] = ['succeeded', 'partial']

export default async function ReportsListPage() {
  const timezone = await organizationTimezone()
  const jobs = await listJobs()

  if (!jobs.ok) {
    return (
      <div className="mx-auto max-w-wide">
        <InlineError what={jobs.error.message} />
      </div>
    )
  }

  const reports = jobs.value.filter((job) => REPORTABLE.includes(job.status))

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Laporan"
        description="Setiap analisis yang selesai punya satu laporan: sebaran sentimen, topik, kata kunci, dan penjelajah aspirasi."
        crumbs={[{ label: 'Laporan' }]}
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada laporan"
          description="Setiap analisis yang selesai otomatis punya laporan. Jalankan satu analisis dulu."
          action={{ label: 'Pilih dataset', href: '/datasets' }}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead className="text-right">Aspirasi</TableHead>
                <TableHead className="hidden sm:table-cell">Selesai</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/reports/${job.id}`}
                      className="rounded-chip hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {job.datasetName}
                    </Link>
                    {job.status === 'partial' ? (
                      <span className="mt-1 block">
                        <Badge variant="notice">
                          {job.failedCount} aspirasi gagal dianalisis
                        </Badge>
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.processedCount}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDateTime(job.finishedAt ?? job.createdAt, timezone)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/reports/${job.id}`}>
                        Buka
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
