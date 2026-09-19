import { redirect } from 'next/navigation'
import { getSessionUser } from '@/modules/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')

  return <AppShell email={session.value.email}>{children}</AppShell>
}
