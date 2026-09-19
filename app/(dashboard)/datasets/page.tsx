import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dataset' }

export default function DatasetsPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Dataset</h1>
      <p className="text-sm text-muted-foreground">
        Daftar upload dan form unggah CSV/Excel dipasang di sini.
      </p>
    </section>
  )
}
