import { redirect } from 'next/navigation'
import { getAuthUser, getSessionUser } from '@/modules/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionUser()
  if (!session.ok) {
    // Two very different failures land here. Not signed in is the ordinary one.
    // Signed in with no organization is not: it happens when OAuth provisioning
    // failed, or a membership was revoked, and sending that user to a blank
    // login form tells them nothing while middleware sends them straight back.
    const identity = await getAuthUser()
    redirect(identity.ok ? '/login?error=provisioning' : '/login')
  }

  return (
    <AppShell
      email={session.value.email}
      displayName={session.value.displayName}
      organizationName={session.value.organizationName}
    >
      {children}
    </AppShell>
  )
}
