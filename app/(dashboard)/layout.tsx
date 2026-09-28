import { redirect } from 'next/navigation'
import { countReports } from '@/modules/analysis'
import { can, getAuthUser, getSessionUser } from '@/modules/auth'
import { countDatasets } from '@/modules/ingestion'
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

  // Badge counts only. A failed count hides its badge rather than showing 0,
  // which would be a claim ("you have no datasets") the page cannot back.
  const [datasets, reports] = await Promise.all([countDatasets(), countReports()])

  return (
    <AppShell
      user={{
        email: session.value.email,
        displayName: session.value.displayName,
        organizationName: session.value.organizationName,
      }}
      counts={{
        datasets: datasets.ok ? datasets.value : null,
        reports: reports.ok ? reports.value : null,
      }}
      canCreate={can(session.value.role, 'dataset:create')}
    >
      {children}
    </AppShell>
  )
}
