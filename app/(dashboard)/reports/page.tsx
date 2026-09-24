import { FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/layout/empty-state'
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
  const jobs = await listJobs()

  if (!jobs.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {jobs.error.message}
      </p>
    )
  }

  const reports = jobs.value.filter((job) => REPORTABLE.includes(job.status))

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Laporan</h1>
        <p className="text-sm text-muted-foreground">
          Setiap analisis yang selesai punya satu laporan: sebaran sentimen, topik, kata
          kunci, dan penjelajah aspirasi.
        </p>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada laporan"
          description="Setiap analisis yang selesai otomatis punya laporan. Jalankan satu analisis dulu."
          action={{ label: 'Pilih dataset', href: '/datasets' }}
        />
      ) : (
        <Card>
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
                    <Link href={`/reports/${job.id}`} className="hover:underline">
                      {job.datasetName}
                    </Link>
                    {job.status === 'partial' ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {job.failedCount} aspirasi gagal dianalisis
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.processedCount}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDateTime(job.finishedAt ?? job.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/reports/${job.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Buka
                    </Link>
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
