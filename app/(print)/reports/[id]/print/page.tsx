import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/reports/print-button'
import { PrintDocument } from '@/components/reports/print-document'
import { Button } from '@/components/ui/button'
import { can, getSessionUser } from '@/modules/auth'
import { reportFileStem } from '@/modules/reporting'
import { loadExportContext, loadReportExport } from '@/app/api/_lib/report-data'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ auto?: string }>
}

/**
 * One load per request, shared by the title and the page. Archived reports
 * are included: this page is how their PDF is got out before deletion.
 */
const loadPrintable = cache(async (id: string) => {
  const session = await getSessionUser()
  if (!session.ok) return { kind: 'signed-out' as const }
  if (!can(session.value.role, 'report:export')) return { kind: 'forbidden' as const }

  const bundle = await loadReportExport(id, await loadExportContext(session.value), {
    includeArchived: true,
  })
  return bundle.ok
    ? { kind: 'ok' as const, bundle: bundle.value }
    : { kind: 'missing' as const }
})

/** The browser names a saved PDF after the title, so the title is the file name. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadPrintable((await params).id)
  return {
    title: {
      absolute:
        loaded.kind === 'ok'
          ? reportFileStem(loaded.bundle.document.datasetName)
          : 'Laporan · SAMOSA',
    },
  }
}

/**
 * Pilot 01, §2.2: the server-rendered PDF timed out in production, and what
 * worked was printing. So the PDF is this page, printed by the browser.
 */
export default async function ReportPrintPage({ params, searchParams }: Props) {
  const { id } = await params
  const { auto } = await searchParams
  const loaded = await loadPrintable(id)

  if (loaded.kind === 'signed-out') redirect(`/login?next=/reports/${id}/print`)
  if (loaded.kind === 'missing') notFound()
  if (loaded.kind === 'forbidden') {
    return (
      <main className="mx-auto max-w-narrative space-y-3 px-4 py-16">
        <h1 className="text-xl font-semibold">Tidak bisa mengunduh laporan ini</h1>
        <p className="text-sm text-muted-foreground">
          Peranmu di organisasi ini tidak termasuk mengekspor laporan. Laporannya tetap
          bisa kamu baca di aplikasi.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports/${id}`}>Kembali ke laporan</Link>
        </Button>
      </main>
    )
  }

  const { bundle } = loaded
  const cited = new Set(bundle.document.insights.flatMap((i) => i.evidenceResponseIds))
  const quotes: Record<string, string> = {}
  for (const row of bundle.rows) {
    if (cited.has(row.responseId)) quotes[row.responseId] = row.responseText
  }

  // An archived report has no page in the app to go back to.
  const back = bundle.archived
    ? { href: '/settings?tab=data', label: 'Kembali ke pengaturan' }
    : { href: `/reports/${id}`, label: 'Kembali ke laporan' }

  return (
    <>
      <div
        data-print="hide"
        className="sticky top-0 z-10 border-b bg-background px-4 py-3"
      >
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={back.href}>
              <ArrowLeft aria-hidden />
              {back.label}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Pilih <span className="font-medium">Simpan sebagai PDF</span> di jendela
              cetak.
            </p>
            <PrintButton auto={auto === '1'} />
          </div>
        </div>
      </div>

      <main className="print-sheet mx-auto my-8 max-w-[210mm] rounded-card border bg-card p-[16mm]">
        <PrintDocument data={bundle.document} quotes={quotes} />
      </main>
    </>
  )
}
