import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AnalyzeButton } from '@/components/analysis/analyze-button'
import { DeleteDatasetButton } from '@/components/datasets/delete-dataset-button'
import { InlineError } from '@/components/layout/inline-error'
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
import { formatDateTime } from '@/lib/utils'
import { can, getSessionUser } from '@/modules/auth'
import {
  BATCH_SIZE,
  estimateJobCostMicroIdr,
  estimateJobSeconds,
  formatIdr,
  getLatestJobForDataset,
} from '@/modules/analysis'
import { RESPONSES_PAGE_SIZE, getDataset, listResponses } from '@/modules/ingestion'

export const metadata: Metadata = { title: 'Detail dataset' }

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { id } = await params
  const { page } = await searchParams

  const session = await getSessionUser()
  if (!session.ok) redirect('/login')
  const { organizationId } = session.value

  const dataset = await getDataset(organizationId, id)
  if (!dataset.ok) notFound()

  const currentPage = Number.parseInt(page ?? '1', 10)
  const [responses, latestJob] = await Promise.all([
    listResponses(organizationId, id, Number.isNaN(currentPage) ? 1 : currentPage),
    getLatestJobForDataset(organizationId, id),
  ])

  const canDelete = can(session.value.role, 'dataset:delete')
  const timezone = session.value.organizationTimezone
  const canAnalyze = can(session.value.role, 'analysis:run')

  // Pricing tables stay on the server; the button receives a formatted string.
  const estimatedCost = formatIdr(
    estimateJobCostMicroIdr('gpt-4o-mini', dataset.value.responseCount, BATCH_SIZE),
  )

  const facts = [
    { label: 'Sumber', value: dataset.value.source.toUpperCase() },
    { label: 'Jumlah aspirasi', value: String(dataset.value.responseCount) },
    { label: 'Kolom teks', value: dataset.value.textColumnName ?? '—' },
    { label: 'Diunggah', value: formatDateTime(dataset.value.createdAt, timezone) },
  ]

  const kept = dataset.value.keptColumns

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title={dataset.value.name}
        crumbs={[{ label: 'Dataset', href: '/datasets' }, { label: dataset.value.name }]}
        actions={
          <>
            {latestJob.ok && latestJob.value ? (
              <Button asChild variant="outline">
                <Link href={`/analysis/${latestJob.value.id}`}>Lihat analisis</Link>
              </Button>
            ) : null}
            {canAnalyze ? (
              <AnalyzeButton
                datasetId={dataset.value.id}
                responseCount={dataset.value.responseCount}
                estimatedCost={estimatedCost}
                estimatedSeconds={estimateJobSeconds(
                  dataset.value.responseCount,
                  BATCH_SIZE,
                )}
              />
            ) : null}
            {canDelete ? (
              <DeleteDatasetButton
                datasetId={dataset.value.id}
                datasetName={dataset.value.name}
                redirectTo="/datasets"
              />
            ) : null}
          </>
        }
      />

      {latestJob.ok && latestJob.value ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Analisis terakhir:
          <StatusIndicator status={latestJob.value.status} size="sm" />
          <span>· {formatDateTime(latestJob.value.createdAt, timezone)}</span>
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

      {/**
       * §P4 asks for an explicit kept-column summary. It belongs on this page and
       * not only in the upload wizard: the question "what personal data is in
       * this dataset?" is asked weeks after the upload, by someone who did not
       * do it.
       */}
      <div className="flex flex-wrap items-start gap-3 rounded-card border bg-muted/40 px-4 py-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        {kept.length === 0 ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Kolom lain tidak disimpan.
            </span>{' '}
            Hanya kolom teks aspirasi yang masuk ke basis data. Nama, kelas, atau email di
            file aslinya tidak ikut tersimpan.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">
              {kept.length} kolom tambahan disimpan bersama teks:
            </p>
            <div className="flex flex-wrap gap-1">
              {kept.map((column) => (
                <Badge key={column} variant="outline">
                  {column}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">
              Kolom ini dipilih manual saat mengunggah. Kolom lain di file yang sama tidak
              disimpan.
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aspirasi mentah</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!responses.ok ? (
            <InlineError
              what={responses.error.message}
              recovery="Muat ulang halaman ini. Kalau dataset baru saja diunggah, tunggu sebentar lalu coba lagi."
            />
          ) : responses.value.responses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Dataset ini kosong.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Teks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.value.responses.map((response, index) => (
                    <TableRow key={response.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {(responses.value.page - 1) * RESPONSES_PAGE_SIZE + index + 1}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {response.text}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="tabular-nums">
                  Halaman {responses.value.page} dari {responses.value.pageCount} ·{' '}
                  {responses.value.total} aspirasi
                </span>
                {/* A disabled Button with asChild would still render a working
                      link, so render plain text when there is nowhere to go. */}
                <div className="flex gap-2">
                  {responses.value.page > 1 ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/datasets/${id}?page=${responses.value.page - 1}`}>
                        Sebelumnya
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Sebelumnya
                    </Button>
                  )}
                  {responses.value.page < responses.value.pageCount ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/datasets/${id}?page=${responses.value.page + 1}`}>
                        Berikutnya
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Berikutnya
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
