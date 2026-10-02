import Link from 'next/link'
import { EditableNameForm } from '@/components/settings/editable-name-form'
import { ImageUploadField } from '@/components/settings/image-upload-field'
import { TIME_ZONE_LABELS, TimezoneForm } from '@/components/settings/timezone-form'
import { TransferOwnershipDialog } from '@/components/settings/transfer-ownership-dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  can,
  getOrganizationSettings,
  listMembers,
  type SessionUser,
} from '@/modules/auth'
import { ROLE_LABELS } from '@/types/domain'

export async function OrganizationTab({ session }: { session: SessionUser }) {
  const canManage = can(session.role, 'org:manage')
  const [settings, members] = await Promise.all([
    getOrganizationSettings(session.organizationId),
    listMembers(session.organizationId),
  ])

  const owner = members.ok
    ? members.value.find((member) => member.role === 'owner')
    : undefined
  const ownerName = owner ? owner.displayName || owner.email : null
  const candidates = members.ok
    ? members.value
        .filter((member) => member.userId !== session.userId)
        .map((member) => ({
          userId: member.userId,
          name: member.displayName || member.email,
          email: member.email,
          roleLabel: ROLE_LABELS[member.role],
        }))
    : []

  const logoUrl = settings.ok ? settings.value.logoUrl : null
  const timezone = settings.ok ? settings.value.timezone : session.organizationTimezone

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {session.solo ? 'Nama dan logo' : 'Profil organisasi'}
          </CardTitle>
          <CardDescription>
            {session.solo
              ? 'Keduanya tercetak di setiap laporan PDF yang kamu unduh.'
              : 'Nama dan logo muncul di header aplikasi dan di setiap laporan PDF.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/**
           * §5: no disabled controls for a role that cannot use them. A member
           * gets the values as text — the part they can use — and the reason
           * they are not editable.
           */}
          {canManage ? (
            <>
              <EditableNameForm
                id="organization-name"
                label={session.solo ? 'Nama di laporan' : 'Nama organisasi'}
                endpoint="/api/settings/organization"
                field="name"
                initialValue={session.organizationName}
                successMessage={
                  session.solo ? 'Nama tersimpan.' : 'Nama organisasi tersimpan.'
                }
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Logo</p>
                <ImageUploadField
                  label="Logo"
                  endpoint="/api/settings/organization/logo"
                  initialUrl={logoUrl}
                  fallbackName={session.organizationName}
                  shape="square"
                  savedMessage="Logo tersimpan. Laporan PDF berikutnya memakainya."
                  removedMessage="Logo dihapus."
                />
              </div>
              <TimezoneForm initialValue={timezone} />
            </>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-4">
                <UserAvatar
                  name={session.organizationName}
                  imageUrl={logoUrl}
                  size="lg"
                  shape="square"
                />
                <div>
                  <p className="font-medium">{session.organizationName}</p>
                  <p className="text-muted-foreground">{TIME_ZONE_LABELS[timezone]}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Hanya pemilik yang bisa mengubah ini. Peranmu: {ROLE_LABELS[session.role]}
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alone, there is nobody to hand it to and nothing to explain. */}
      {session.solo ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kepemilikan</CardTitle>
            <CardDescription>
              {ownerName ? (
                <>
                  Pemilik saat ini:{' '}
                  <span className="font-medium text-foreground">{ownerName}</span>
                  {owner?.userId === session.userId ? ' (kamu)' : ''}.
                </>
              ) : (
                'Pemilik organisasi ini tidak bisa dimuat.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {canManage ? (
              <>
                <p className="text-muted-foreground">
                  Pengurus berganti setiap tahun ajaran. Sebelum lulus, serahkan
                  kepemilikan ke pengurus berikutnya supaya arsip laporan tetap bisa
                  dikelola tanpa akunmu.
                </p>
                {candidates.length > 0 ? (
                  <TransferOwnershipDialog
                    organizationName={session.organizationName}
                    candidates={candidates}
                  />
                ) : (
                  <p>
                    Belum ada anggota lain.{' '}
                    <Link
                      href="/settings?tab=anggota"
                      className="font-medium underline underline-offset-4"
                    >
                      Undang calon pemilik baru
                    </Link>{' '}
                    dulu — kepemilikan hanya bisa diserahkan ke anggota organisasi ini.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Hanya pemilik yang bisa menyerahkan kepemilikan. Kalau pemiliknya sudah
                lulus, minta ia menyerahkannya dari halaman ini.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
