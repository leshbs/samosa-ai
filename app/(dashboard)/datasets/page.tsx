import type { Metadata } from 'next'
import Link from 'next/link'
import { DeleteDatasetButton } from '@/components/datasets/delete-dataset-button'
import { Button } from '@/components/ui/button'
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
import { can, getSessionUser } from '@/modules/auth'
import { listDatasets } from '@/modules/ingestion'

export const metadata: Metadata = { title: 'Dataset' }

export default async function DatasetsPage() {
  const session = await getSessionUser()
  const datasets = await listDatasets()

  if (!datasets.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {datasets.error.message}
      </p>
    )
  }

  const canDelete = session.ok && can(session.value.role, 'dataset:delete')

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Dataset</h1>
          <p className="text-sm text-muted-foreground">
            Semua aspirasi yang sudah diunggah organisasimu.
          </p>
        </div>
        <Button asChild>
          <Link href="/datasets/new">Unggah dataset</Link>
        </Button>
      </div>

      {datasets.value.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Belum ada dataset. Unggah CSV atau Excel hasil Google Forms untuk mulai.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="text-right">Aspirasi</TableHead>
                <TableHead>Diunggah</TableHead>
                {canDelete ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.value.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell className="font-medium">
                    <Link href={`/datasets/${dataset.id}`} className="hover:underline">
                      {dataset.name}
                    </Link>
                  </TableCell>
                  <TableCell className="uppercase text-muted-foreground">
                    {dataset.source}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dataset.responseCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(dataset.createdAt)}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <DeleteDatasetButton
                        datasetId={dataset.id}
                        datasetName={dataset.name}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
