import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CreateOrganizationForm } from '@/components/forms/create-organization-form'
import { SignOutButton } from '@/components/forms/sign-out-button'
import { getAuthUser, getSessionUser } from '@/modules/auth'

export const metadata: Metadata = { title: 'Tanpa organisasi' }

/**
 * Where the dashboard sends a signed-in account with no organization. Since
 * members can be removed and organizations deleted (ADR-0010) this is an
 * ordinary state, not a broken signup: whoever lands here needs to know why
 * and have a way forward — rejoin through an invitation, or start their own.
 */
export default async function NoOrganizationPage() {
  const [user, session] = await Promise.all([getAuthUser(), getSessionUser()])
  if (!user.ok) redirect('/login')
  if (session.ok) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Kamu belum tergabung di organisasi</h1>
        <p className="text-sm text-muted-foreground">
          Akun <span className="font-medium text-foreground">{user.value.email}</span>{' '}
          tidak lagi menjadi anggota organisasi mana pun. Biasanya karena kamu dikeluarkan
          oleh pengurus, atau organisasinya dihapus pemiliknya.
        </p>
        <p className="text-sm text-muted-foreground">
          Punya tautan undangan? Buka tautan itu untuk bergabung. Atau mulai organisasi
          sendiri di bawah ini.
        </p>
      </div>

      <CreateOrganizationForm />
      <SignOutButton label="Keluar" />
    </div>
  )
}
