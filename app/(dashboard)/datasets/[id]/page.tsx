import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DeleteDatasetButton } from '@/components/datasets/delete-dataset-button'
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
import { formatDateTime } from '@/lib/utils'
import { can, getSessionUser } from '@/modules/auth'
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

  const dataset = await getDataset(id)
  if (!dataset.ok) notFound()

  const currentPage = Number.parseInt(page ?? '1', 10)
  const responses = await listResponses(id, Number.isNaN(currentPage) ? 1 : currentPage)
  const session = await getSessionUser()
  const canDelete = session.ok && can(session.value.role, 'dataset:delete')

  const facts = [
    { label: 'Sumber', value: dataset.value.source.toUpperCase() },
    { label: 'Jumlah aspirasi', value: String(dataset.value.responseCount) },
    { label: 'Kolom teks', value: dataset.value.textColumnName ?? '—' },
    { label: 'Diunggah', value: formatDateTime(dataset.value.createdAt) },
  ]

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/datasets"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Semua dataset
          </Link>
          <h1 className="text-2xl font-semibold">{dataset.value.name}</h1>
        </div>
        {canDelete ? (
          <DeleteDatasetButton
            datasetId={dataset.value.id}
            datasetName={dataset.value.name}
            redirectTo="/datasets"
          />
        ) : null}
      </div>

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
        <CardHeader>
          <CardTitle className="text-base">Aspirasi mentah</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!responses.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {responses.error.message}
            </p>
          ) : responses.value.responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Dataset ini kosong.</p>
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

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
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
