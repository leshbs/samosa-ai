import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Analisis' }

export default function AnalysisListPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Analisis</h1>
      <p className="text-sm text-muted-foreground">
        Daftar job analisis beserta statusnya dipasang di sini.
      </p>
    </section>
  )
}
