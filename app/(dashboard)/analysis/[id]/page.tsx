import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JobProgress } from '@/components/analysis/job-progress'
import { SentimentBadge } from '@/components/analysis/sentiment-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, formatPercent } from '@/lib/utils'
import { formatIdr, getJob, listJobResults } from '@/modules/analysis'

export const metadata: Metadata = { title: 'Analisis' }

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const job = await getJob(id)
  if (!job.ok) notFound()

  const results = await listJobResults(id)
  const rows = results.ok ? results.value : []

  const facts = [
    { label: 'Status', value: job.value.status },
    { label: 'Model', value: job.value.modelId || '—' },
    { label: 'Prompt', value: job.value.promptVersion },
    {
      label: 'Biaya',
      value: job.value.costMicroIdr > 0 ? formatIdr(job.value.costMicroIdr) : '—',
    },
  ]

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/datasets/${job.value.datasetId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Kembali ke dataset
        </Link>
        <h1 className="text-2xl font-semibold">Hasil analisis</h1>
        <p className="text-sm text-muted-foreground">
          Dimulai {formatDateTime(job.value.createdAt)}
        </p>
      </div>

      <JobProgress
        jobId={job.value.id}
        initialStatus={job.value.status}
        initialProcessed={job.value.processedCount}
        initialTotal={job.value.totalCount}
      />

      {job.value.failedCount > 0 ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {job.value.failedCount} aspirasi gagal dianalisis. Hasil di bawah tetap valid
          untuk sisanya.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {fact.label}
              </p>
              <p className="mt-1 font-medium">{fact.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Per aspirasi</CardTitle>
          {rows.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/reports/${job.value.id}`}>Lihat laporan</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada hasil. Halaman ini akan memperbarui sendiri saat job selesai.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Sentimen</TableHead>
                  <TableHead>Aspirasi</TableHead>
                  <TableHead className="w-48">Topik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.responseId}>
                    <TableCell>
                      <SentimentBadge sentiment={row.sentiment} />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatPercent(row.confidence)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap">
                      {row.responseText}
                      {row.summary ? (
                        <span className="mt-1 block text-xs italic text-muted-foreground">
                          {row.summary}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.topics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
