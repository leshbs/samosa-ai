import type { Metadata } from 'next'
import Link from 'next/link'
import { UploadWizard } from '@/components/datasets/upload-wizard'

export const metadata: Metadata = { title: 'Unggah dataset' }

export default function NewDatasetPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/datasets" className="text-sm text-muted-foreground hover:underline">
          ← Semua dataset
        </Link>
        <h1 className="text-2xl font-semibold">Unggah dataset</h1>
        <p className="text-sm text-muted-foreground">
          Ekspor Google Forms ke CSV atau Excel, lalu pilih kolom yang berisi aspirasi.
        </p>
      </div>

      <UploadWizard />
    </section>
  )
}
