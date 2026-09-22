import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { EditableNameForm } from '@/components/settings/editable-name-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIdr, getUsageSummary } from '@/modules/analysis'
import { can, getSessionUser } from '@/modules/auth'

export const metadata: Metadata = { title: 'Pengaturan' }

const ROLE_LABELS: Record<string, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  member: 'Anggota',
  viewer: 'Pengamat',
}

export default async function SettingsPage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')

  const canManageOrg = can(session.value.role, 'org:manage')
  const usage = await getUsageSummary(session.value.organizationId)

  const usageRows = usage.ok
    ? [
        { label: 'Analisis dijalankan', value: String(usage.value.totalJobs) },
        {
          label: 'Aspirasi dianalisis',
          value: usage.value.responsesAnalyzed.toLocaleString('id-ID'),
        },
        {
          label: 'Token terpakai',
          value: (usage.value.inputTokens + usage.value.outputTokens).toLocaleString(
            'id-ID',
          ),
        },
        { label: 'Perkiraan biaya', value: formatIdr(usage.value.costMicroIdr) },
      ]
    : []

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Detail akun, organisasi, dan pemakaian.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditableNameForm
            id="display-name"
            label="Nama"
            endpoint="/api/settings/profile"
            field="displayName"
            initialValue={session.value.displayName}
            placeholder="Nama yang dilihat anggota lain"
            successMessage="Nama tersimpan."
          />

          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{session.value.email}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Email terikat ke akun Google-mu dan diubah dari sana.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditableNameForm
            id="organization-name"
            label="Nama organisasi"
            endpoint="/api/settings/organization"
            field="name"
            initialValue={session.value.organizationName}
            successMessage="Nama organisasi tersimpan."
            description="Muncul di header dan di setiap laporan yang diekspor."
            disabled={!canManageOrg}
            disabledReason={`Hanya pemilik yang bisa mengubah ini. Peranmu: ${
              ROLE_LABELS[session.value.role] ?? session.value.role
            }.`}
          />

          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Peran</span>
            <span className="font-medium">
              {ROLE_LABELS[session.value.role] ?? session.value.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Mengundang anggota lewat email menyusul; sampai saat itu satu organisasi
            dipakai satu akun.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pemakaian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.ok ? (
            <>
              {usageRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Biaya dihitung dari token terpakai dengan tarif saat analisis berjalan,
                jadi angkanya perkiraan — bukan tagihan.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Data pemakaian belum bisa dimuat.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
