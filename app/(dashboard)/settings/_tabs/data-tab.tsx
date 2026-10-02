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
import { countReports } from '@/modules/analysis'
import { can, listMembers, type SessionUser } from '@/modules/auth'
import { countDatasets } from '@/modules/ingestion'

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unduh semua data</CardTitle>
          <CardDescription>
            Satu file .zip: setiap dataset sebagai CSV, setiap laporan sebagai PDF dan
            CSV, plus metadata — organisasi, anggota, dan versi prompt setiap analisis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canExport ? (
            <>
              <ExportArchiveButton />
              <p className="text-xs text-muted-foreground">
                Organisasi dengan banyak laporan butuh sekitar satu menit. Bisa dibuka
                tanpa SAMOSA — CSV-nya langsung terbaca di Excel.
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
            <CardTitle className="text-base text-destructive">Hapus organisasi</CardTitle>
            <CardDescription>
              Menghapus organisasi beserta semua dataset, laporan, dan akses anggotanya.
              Akun setiap anggota tetap ada. Tidak bisa dibatalkan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationDialog
              organizationName={session.organizationName}
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
