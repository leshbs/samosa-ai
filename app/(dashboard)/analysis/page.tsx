import { Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/modules/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/layout/empty-state'
import { InlineError } from '@/components/layout/inline-error'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { StatusIndicator } from '@/components/ui/status-indicator'
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

export const metadata: Metadata = { title: 'Analisis' }

export default async function AnalysisListPage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')
  const timezone = session.value.organizationTimezone
  const jobs = await listJobs(session.value.organizationId)

  if (!jobs.ok) {
    return (
      <div className="mx-auto max-w-wide">
        <InlineError what={jobs.error.message} />
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Analisis"
        description="Riwayat job analisis beserta status dan biayanya."
        crumbs={[{ label: 'Analisis' }]}
      />

      {jobs.value.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Belum ada analisis"
          description="Analisis dijalankan dari halaman dataset: buka salah satu dataset, lalu tekan Analisis."
          action={{ label: 'Pilih dataset', href: '/datasets' }}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Dianalisis</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Biaya</TableHead>
                <TableHead className="hidden md:table-cell">Dimulai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.value.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/analysis/${job.id}`}
                      className="rounded-chip hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {job.datasetName}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">
                      {formatDateTime(job.createdAt, timezone)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusIndicator status={job.status} size="sm" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {job.processedCount} / {job.totalCount}
                    {job.failedCount > 0 ? (
                      <span className="block text-xs text-notice">
                        {job.failedCount} gagal
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {job.costMicroIdr > 0 ? formatIdr(job.costMicroIdr) : '—'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTime(job.createdAt, timezone)}
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
