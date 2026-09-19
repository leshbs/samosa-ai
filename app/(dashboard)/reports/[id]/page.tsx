import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Laporan' }

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Laporan {id}</h1>
      <p className="text-sm text-muted-foreground">
        Dashboard sentimen, topik, insight, dan tombol export dipasang di sini.
      </p>
    </section>
  )
}
