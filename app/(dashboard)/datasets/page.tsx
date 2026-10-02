import { Upload } from 'lucide-react'
import { redirect } from 'next/navigation'
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
import { daysUntil, isNearDeadline, retentionDeadline } from '@/lib/retention'
import { formatDate, formatDateTime } from '@/lib/utils'
import { can, getSessionUser, getWorkspacePlan } from '@/modules/auth'
import { listDatasets } from '@/modules/ingestion'

export const metadata: Metadata = { title: 'Dataset' }

export default async function DatasetsPage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')
  const [datasets, plan] = await Promise.all([
    listDatasets(session.value.organizationId),
    getWorkspacePlan(session.value.organizationId),
  ])

  if (!datasets.ok) {
    return (
      <div className="mx-auto max-w-wide">
        <InlineError what={datasets.error.message} />
      </div>
    )
  }

  const canDelete = can(session.value.role, 'dataset:delete')
  const timezone = session.value.organizationTimezone
  // §5: an action this role cannot take is absent, not disabled.
  const canUpload = can(session.value.role, 'dataset:create')

  // Only on a plan with a retention period; elsewhere there is no date to show.
  const { retentionDays } = plan.limits
  const deadlineOf = (clockAt: string) => retentionDeadline(clockAt, retentionDays)
  const expiring = datasets.value
    .map((dataset) => deadlineOf(dataset.retentionClockAt))
    .filter((deadline): deadline is Date => isNearDeadline(deadline))
    .sort((a, b) => a.getTime() - b.getTime())
  const soonest = expiring[0]

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Dataset"
        description="Semua aspirasi yang sudah diunggah ke sini."
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

      {soonest ? (
        <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          <span className="font-medium">
            {expiring.length} dataset{' '}
            {daysUntil(soonest) > 0
              ? `diarsipkan mulai ${formatDate(soonest, timezone)}`
              : 'sudah melewati masa simpannya dan segera diarsipkan'}
            .
          </span>{' '}
          Dataset yang diarsipkan tidak tampil lagi di sini, tapi masih bisa diunduh
          selama 90 hari sebelum dihapus.{' '}
          <Link
            href="/settings?tab=data"
            className="font-medium underline underline-offset-4"
          >
            Unduh semua data
          </Link>
        </p>
      ) : null}

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
                {retentionDays !== null ? (
                  <TableHead className="hidden lg:table-cell">Disimpan sampai</TableHead>
                ) : null}
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
                  {retentionDays !== null ? (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDate(
                        deadlineOf(dataset.retentionClockAt) ?? dataset.createdAt,
                        timezone,
                      )}
                    </TableCell>
                  ) : null}
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
