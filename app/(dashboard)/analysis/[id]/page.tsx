import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Analisis' }

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Analisis {id}</h1>
      <p className="text-sm text-muted-foreground">
        Progres job (polling /api/analysis/{id}/status) dipasang di sini.
      </p>
    </section>
  )
}
