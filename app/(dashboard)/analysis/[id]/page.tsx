import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JobProgress } from '@/components/analysis/job-progress'
import { SentimentBadge } from '@/components/analysis/sentiment-badge'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusIndicator } from '@/components/ui/status-indicator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, formatPercent } from '@/lib/utils'
import {
  BATCH_SIZE,
  estimateJobCostMicroIdr,
  formatIdr,
  getJob,
  listJobResults,
} from '@/modules/analysis'
import { getDataset } from '@/modules/ingestion'

export const metadata: Metadata = { title: 'Analisis' }

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const job = await getJob(id)
  if (!job.ok) notFound()

  const [results, dataset] = await Promise.all([
    listJobResults(id),
    getDataset(job.value.datasetId),
  ])

  const rows = results.ok ? results.value : []
  const datasetName = dataset.ok ? dataset.value.name : 'Dataset terhapus'
  const hasActualCost = job.value.costMicroIdr > 0

  /**
   * §P6 wants a cost figure beside every AI action. Once the job has run, that is
   * the recorded cost; while it is running there is nothing recorded yet, so the
   * pre-run estimate stands in and is labelled as an estimate rather than
   * presented as a fact.
   */
  const cost = hasActualCost
    ? { label: 'Biaya', value: formatIdr(job.value.costMicroIdr) }
    : {
        label: 'Perkiraan biaya',
        value: formatIdr(
          estimateJobCostMicroIdr('gpt-4o-mini', job.value.totalCount, BATCH_SIZE),
        ),
      }

  const facts = [
    { label: 'Status', value: null },
    { label: 'Model', value: job.value.modelId || '—' },
    { label: 'Prompt', value: job.value.promptVersion },
    { label: cost.label, value: hasActualCost ? cost.value : '—' },
  ]

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Hasil analisis"
        description={`Dimulai ${formatDateTime(job.value.createdAt)} · dataset ${datasetName}`}
        crumbs={[
          { label: 'Analisis', href: '/analysis' },
          { label: 'Dataset', href: `/datasets/${job.value.datasetId}` },
          { label: 'Hasil' },
        ]}
        actions={
          rows.length > 0 ? (
            <Button asChild>
              <Link href={`/reports/${job.value.id}`}>
                Lihat laporan
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null
        }
      />

      <JobProgress
        jobId={job.value.id}
        initialStatus={job.value.status}
        initialProcessed={job.value.processedCount}
        initialTotal={job.value.totalCount}
        modelId={job.value.modelId}
        failedCount={job.value.failedCount}
        cost={cost}
      />

      {job.value.failedCount > 0 ? (
        <p className="flex flex-wrap items-center gap-2 rounded-card border border-notice/40 bg-notice-surface px-4 py-3 text-sm">
          <Badge variant="notice">{job.value.failedCount} gagal</Badge>
          <span className="text-muted-foreground">
            Aspirasi ini tidak punya hasil analisis. Angka di bawah menggambarkan sisanya
            dan tetap valid untuk mereka.
          </span>
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {fact.label}
              </p>
              {fact.value === null ? (
                <span className="mt-1 block">
                  <StatusIndicator status={job.value.status} size="sm" />
                </span>
              ) : (
                <p className="mt-1 font-medium">{fact.value}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per aspirasi</CardTitle>
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
                  <TableHead className="hidden w-48 md:table-cell">Topik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.responseId}>
                    <TableCell className="align-top">
                      <SentimentBadge sentiment={row.sentiment} />
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {formatPercent(row.confidence)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap align-top">
                      {row.responseText}
                      {row.summary ? (
                        <span className="mt-1 block text-xs italic text-muted-foreground">
                          {row.summary}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {row.topics.map((topic) => (
                          <Badge key={topic} variant="muted">
                            {topic}
                          </Badge>
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
