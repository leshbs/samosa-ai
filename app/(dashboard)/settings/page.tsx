import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSessionUser } from '@/modules/auth'

export const metadata: Metadata = { title: 'Pengaturan' }

export default async function SettingsPage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')

  const facts = [
    { label: 'Organisasi', value: session.value.organizationName },
    { label: 'Email', value: session.value.email },
    { label: 'Peran', value: session.value.role },
  ]

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Detail akun dan organisasimu. Mengundang anggota menyusul di fase berikutnya.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{fact.label}</span>
              <span className="font-medium">{fact.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
