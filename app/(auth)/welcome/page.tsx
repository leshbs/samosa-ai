import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CreateWorkspaceForm } from '@/components/forms/create-workspace-form'
import { SignOutButton } from '@/components/forms/sign-out-button'
import {
  INVITATION_TTL_DAYS,
  getAuthUser,
  getSessionUser,
  listIncomingInvitations,
} from '@/modules/auth'
import { ROLE_LABELS } from '@/types/domain'

export const metadata: Metadata = { title: 'Selamat datang' }

/**
 * Where a signed-in person with no workspace lands (ADR-0012). It is an
 * ordinary state, reached four ways: they signed up through an invitation and
 * have not accepted it, they left, they were removed, or the workspace was
 * deleted. Nothing is created for them behind their back; this page shows what
 * is waiting and lets them start their own.
 */
export default async function WelcomePage() {
  const [user, session] = await Promise.all([getAuthUser(), getSessionUser()])
  if (!user.ok) redirect('/login')
  if (session.ok) redirect('/dashboard')

  const invitations = await listIncomingInvitations()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Kamu belum punya ruang kerja</h1>
        <p className="text-sm text-muted-foreground">
          Akun <span className="font-medium text-foreground">{user.value.email}</span>{' '}
          belum tergabung di mana pun. Gabung lewat undangan, atau mulai ruang kerja
          sendiri.
        </p>
      </div>

      {invitations.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Undangan yang menunggu</h2>
          <ul className="divide-y rounded-lg border">
            {invitations.map((invitation, index) => (
              <li key={index} className="space-y-0.5 px-3 py-2.5">
                <p className="text-sm font-medium">{invitation.organizationName}</p>
                <p className="text-xs text-muted-foreground">
                  {invitation.inviterName || 'Pengurus'} mengundangmu sebagai{' '}
                  {ROLE_LABELS[invitation.role]}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Buka tautan undangan yang dikirim pengurusnya untuk bergabung. Tautan berlaku{' '}
            {INVITATION_TTL_DAYS} hari; kalau hilang, minta mereka mengirim yang baru.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Punya tautan undangan? Buka tautan itu untuk bergabung.
        </p>
      )}

      <CreateWorkspaceForm />
      <SignOutButton label="Keluar" />
    </div>
  )
}
