import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatIdr, getUsageSummary, listJobs } from '@/modules/analysis'
import type { SessionUser } from '@/modules/auth'
import { formatDateTime } from '@/lib/utils'
import { isReportable, type JobStatus } from '@/types/domain'

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Antre',
  running: 'Berjalan',
  succeeded: 'Selesai',
  partial: 'Sebagian',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

/** The list page shows 50; so does this — enough to see where the money went. */
const JOBS_SHOWN = 50

export async function UsageTab({ session }: { session: SessionUser }) {
  const [usage, jobs] = await Promise.all([
    getUsageSummary(session.organizationId),
    listJobs({ limit: JOBS_SHOWN }),
  ])

  const summary = usage.ok
    ? [
        { label: 'Analisis dijalankan', value: String(usage.value.totalJobs) },
        {
          label: 'Aspirasi dianalisis',
          value: usage.value.responsesAnalyzed.toLocaleString('id-ID'),
        },
        {
          label: 'Token terpakai',
          value: (usage.value.inputTokens + usage.value.outputTokens).toLocaleString(
            'id-ID',
          ),
        },
        { label: 'Perkiraan biaya', value: formatIdr(usage.value.costMicroIdr) },
      ]
    : []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total pemakaian</CardTitle>
          <CardDescription>
            Belum ada batas kuota selama masa pilot; angka ini untuk memantau biaya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {usage.ok ? (
            <>
              {summary.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium tabular-nums">{row.value}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Biaya dihitung dari token terpakai dengan tarif saat analisis berjalan,
                jadi angkanya perkiraan — bukan tagihan.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Data pemakaian belum bisa dimuat.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biaya per analisis</CardTitle>
          <CardDescription>
            {jobs.ok && jobs.value.length >= JOBS_SHOWN
              ? `${JOBS_SHOWN} analisis terbaru.`
              : 'Setiap analisis yang pernah dijalankan, terbaru di atas.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!jobs.ok ? (
            <p className="text-sm text-muted-foreground">{jobs.error.message}.</p>
          ) : jobs.value.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada analisis. Biaya muncul di sini setelah analisis pertama selesai.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead className="text-right">Aspirasi</TableHead>
                  <TableHead className="text-right">Token</TableHead>
                  <TableHead className="text-right">Biaya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.value.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-56">
                      <Link
                        href={
                          isReportable(job.status)
                            ? `/reports/${job.id}`
                            : `/analysis/${job.id}`
                        }
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {job.datasetName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(job.createdAt, session.organizationTimezone)} ·{' '}
                        {STATUS_LABELS[job.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.processedCount.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(job.inputTokens + job.outputTokens).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatIdr(job.costMicroIdr)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
