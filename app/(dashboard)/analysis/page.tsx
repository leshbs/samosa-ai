import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime } from '@/lib/utils'
import { formatIdr, listJobs } from '@/modules/analysis'
import type { JobStatus } from '@/types/domain'

export const metadata: Metadata = { title: 'Analisis' }

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Menunggu',
  running: 'Berjalan',
  succeeded: 'Selesai',
  partial: 'Selesai sebagian',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

export default async function AnalysisListPage() {
  const jobs = await listJobs()

  if (!jobs.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {jobs.error.message}
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Analisis</h1>
        <p className="text-sm text-muted-foreground">
          Riwayat job analisis beserta status dan biayanya.
        </p>
      </div>

      {jobs.value.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Belum ada analisis. Buka sebuah dataset lalu tekan Analisis.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Dianalisis</TableHead>
                <TableHead className="text-right">Biaya</TableHead>
                <TableHead>Dimulai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.value.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    <Link href={`/analysis/${job.id}`} className="hover:underline">
                      {job.datasetName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {STATUS_LABELS[job.status]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.processedCount} / {job.totalCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.costMicroIdr > 0 ? formatIdr(job.costMicroIdr) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(job.createdAt)}
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
