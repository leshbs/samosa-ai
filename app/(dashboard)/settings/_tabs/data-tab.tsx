import Link from 'next/link'
import { DeleteOrganizationDialog } from '@/components/settings/delete-organization-dialog'
import { ExportArchiveButton } from '@/components/settings/export-archive-button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { countReports, listJobs } from '@/modules/analysis'
import { can, listMembers, type SessionUser } from '@/modules/auth'
import { countDatasets, listDatasets } from '@/modules/ingestion'
import { deletionDate } from '@/lib/retention'
import { formatDate, formatDateTime } from '@/lib/utils'
import { isReportable } from '@/types/domain'

/** Every job, archived ones included; the list page stops at 50, this must not. */
const ALL_JOBS = 1_000

/**
 * Checklist 5.7: the portability promise (docs/OVERVIEW.md, "semua data user
 * harus bisa di-export") and its counterpart, deletion, on one tab.
 */
export async function DataTab({ session }: { session: SessionUser }) {
  const canExport = can(session.role, 'org:export')
  const canDelete = can(session.role, 'org:manage')

  const [datasets, reports, members] = canDelete
    ? await Promise.all([
        countDatasets(session.organizationId),
        countReports(session.organizationId),
        listMembers(session.organizationId),
      ])
    : [null, null, null]

  const archived = await listDatasets(session.organizationId, { archived: 'only' })
  const timezone = session.organizationTimezone

  // Archived reports have no page in the app, so their PDFs are reached from
  // here: the print page opens them. Only fetched when there is something
  // archived, and only for someone allowed to export.
  const archivedIds = new Set(archived.ok ? archived.value.map((d) => d.id) : [])
  const archivedJobs =
    archivedIds.size > 0 && can(session.role, 'report:export')
      ? await listJobs(session.organizationId, { limit: ALL_JOBS, includeArchived: true })
      : null
  const reportsOf = (datasetId: string) =>
    archivedJobs?.ok
      ? archivedJobs.value.filter(
          (job) => job.datasetId === datasetId && isReportable(job.status),
        )
      : []

  return (
    <div className="space-y-6">
      {archived.ok && archived.value.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Diarsipkan ({archived.value.length})
            </CardTitle>
            <CardDescription>
              Masa simpannya sudah habis, jadi dataset ini dan laporannya tidak tampil
              lagi di aplikasi. Datanya masih ikut di unduhan di bawah, PDF laporannya
              bisa diunduh dari sini, dan semuanya pulih kalau paketmu diganti ke yang
              menyimpan data permanen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {archived.value.map((dataset) => (
                <li
                  key={dataset.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {dataset.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dataset.responseCount.toLocaleString('id-ID')} aspirasi · dihapus{' '}
                    {formatDate(
                      deletionDate(dataset.archivedAt ?? dataset.createdAt),
                      timezone,
                    )}
                  </span>
                  {reportsOf(dataset.id).length > 0 ? (
                    <ul className="flex w-full flex-wrap gap-x-4 gap-y-1 text-xs">
                      {reportsOf(dataset.id).map((job) => (
                        <li key={job.id}>
                          <Link
                            href={`/reports/${job.id}/print`}
                            className="font-medium underline underline-offset-4"
                          >
                            PDF laporan {formatDateTime(job.createdAt, timezone)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unduh semua data</CardTitle>
          <CardDescription>
            Satu file .zip: setiap dataset dan hasil setiap laporan sebagai CSV, plus
            metadata{session.solo ? '' : ' — organisasi, anggota,'} dan versi prompt
            setiap analisis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canExport ? (
            <>
              <ExportArchiveButton />
              <p className="text-xs text-muted-foreground">
                Kalau laporannya banyak, butuh sekitar satu menit. Bisa dibuka tanpa
                SAMOSA — CSV-nya langsung terbaca di Excel.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hanya pemilik dan admin yang bisa mengunduh semua data sekaligus. Laporan
              satu per satu tetap bisa kamu unduh dari{' '}
              <Link href="/reports" className="font-medium underline underline-offset-4">
                halaman laporan
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privasi</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Apa yang disimpan SAMOSA, untuk berapa lama, dan siapa yang bisa membacanya
          dijelaskan di{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-4"
          >
            kebijakan privasi
          </Link>
          . Menghapus satu dataset menghapus aspirasi dan file unggahannya juga.
        </CardContent>
      </Card>

      {canDelete ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              {session.solo ? 'Hapus semua data' : 'Hapus organisasi'}
            </CardTitle>
            <CardDescription>
              {session.solo
                ? 'Menghapus ruang kerja ini beserta semua dataset dan laporannya. Akunmu tetap ada. Tidak bisa dibatalkan.'
                : 'Menghapus organisasi beserta semua dataset, laporan, dan akses anggotanya. Akun setiap anggota tetap ada. Tidak bisa dibatalkan.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationDialog
              organizationName={session.organizationName}
              solo={session.solo}
              datasets={datasets?.ok ? datasets.value : null}
              reports={reports?.ok ? reports.value : null}
              members={members?.ok ? members.value.length : null}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
