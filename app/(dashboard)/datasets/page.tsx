import { Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DeleteDatasetButton } from '@/components/datasets/delete-dataset-button'
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
import { can, getSessionUser } from '@/modules/auth'
import { listDatasets } from '@/modules/ingestion'

export const metadata: Metadata = { title: 'Dataset' }

export default async function DatasetsPage() {
  const [session, datasets] = await Promise.all([getSessionUser(), listDatasets()])

  if (!datasets.ok) {
    return (
      <div className="mx-auto max-w-wide">
        <InlineError what={datasets.error.message} />
      </div>
    )
  }

  const canDelete = session.ok && can(session.value.role, 'dataset:delete')
  const timezone = session.ok ? session.value.organizationTimezone : undefined
  // §5: an action this role cannot take is absent, not disabled.
  const canUpload = session.ok && can(session.value.role, 'dataset:create')

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Dataset"
        description="Semua aspirasi yang sudah diunggah organisasimu."
        crumbs={[{ label: 'Dataset' }]}
        actions={
          canUpload ? (
            <Button asChild>
              <Link href="/datasets/new">
                <Upload aria-hidden />
                Unggah dataset
              </Link>
            </Button>
          ) : null
        }
      />

      {datasets.value.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Belum ada dataset"
          description="Unggah hasil Google Forms dalam format CSV atau Excel untuk mulai menganalisis aspirasi."
          action={
            canUpload
              ? { label: 'Unggah dataset pertama', href: '/datasets/new' }
              : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden sm:table-cell">Sumber</TableHead>
                <TableHead className="text-right">Aspirasi</TableHead>
                <TableHead className="hidden md:table-cell">Diunggah</TableHead>
                {canDelete ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.value.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/datasets/${dataset.id}`}
                      className="rounded-chip hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {dataset.name}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                      {dataset.source.toUpperCase()} ·{' '}
                      {formatDateTime(dataset.createdAt, timezone)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="muted">{dataset.source.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dataset.responseCount}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTime(dataset.createdAt, timezone)}
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
