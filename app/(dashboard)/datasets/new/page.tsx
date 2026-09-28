import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { UploadWizard } from '@/components/datasets/upload-wizard'
import { PageHeader } from '@/components/layout/page-header'
import { can, getSessionUser } from '@/modules/auth'

export const metadata: Metadata = { title: 'Unggah dataset' }

export default async function NewDatasetPage() {
  const session = await getSessionUser()
  // §5 hides the entry point for a role that cannot upload; this closes the door
  // for anyone who reached the URL directly, rather than letting them fill in the
  // whole wizard and collect a 403 at the end.
  if (!session.ok || !can(session.value.role, 'dataset:create')) redirect('/datasets')

  return (
    <section className="mx-auto max-w-wide space-y-6">
      <PageHeader
        title="Unggah dataset"
        description="Ekspor Google Forms ke CSV atau Excel, lalu pilih kolom yang berisi aspirasi."
        crumbs={[{ label: 'Dataset', href: '/datasets' }, { label: 'Unggah' }]}
      />

      <UploadWizard />
    </section>
  )
}
