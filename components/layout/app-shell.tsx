import Link from 'next/link'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'

export function AppShell({
  email,
  organizationName,
  children,
}: {
  email: string
  organizationName: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/dashboard" className="font-semibold">
            SAMOSA
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu email={email} organizationName={organizationName} />
          </div>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[13rem_1fr]">
        {/* Horizontal strip on phones, a real sidebar from md up. */}
        <aside className="border-b p-3 md:min-h-[calc(100vh-3.5rem)] md:border-b-0 md:border-r">
          <SidebarNav />
        </aside>
        <main className="px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  )
}
