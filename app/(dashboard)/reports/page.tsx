import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Laporan' }

export default function ReportsListPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Laporan</h1>
      <p className="text-sm text-muted-foreground">
        Daftar laporan yang sudah jadi dipasang di sini.
      </p>
    </section>
  )
}
