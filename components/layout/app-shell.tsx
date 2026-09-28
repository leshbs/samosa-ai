import { LegalFooter } from '@/components/layout/legal-footer'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Sidebar, type ShellUser } from '@/components/layout/sidebar'
import type { SidebarCounts } from '@/components/layout/sidebar-nav'

/**
 * The application chrome, and nothing the report needs (design_system.md §7.1).
 *
 * A fixed 288px charcoal sidebar against the cream canvas — the contrast is
 * what keeps "where am I" answerable for people who open the app four times a
 * year. There is no top bar on desktop: each page's own header does that job.
 * The sidebar is fixed rather than sticky, so it never competes with the sticky
 * report header for the top edge of the screen.
 *
 * Content is capped at 1180px including its 40px padding, which leaves exactly
 * the 1100px data spine inside it.
 *
 * Everything here is `data-print="hide"`: printing a report should produce the
 * document, not a screenshot of the app around it.
 */
export function AppShell({
  user,
  counts,
  canCreate,
  children,
}: {
  user: ShellUser
  counts: SidebarCounts
  canCreate: boolean
  children: React.ReactNode
}) {
  const sidebar = <Sidebar user={user} counts={counts} canCreate={canCreate} />

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        data-print="hide"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Lewati ke konten
      </a>

      <aside
        data-print="hide"
        className="fixed inset-y-0 left-0 z-40 hidden w-sidebar lg:flex"
      >
        {sidebar}
      </aside>

      <MobileNav>{sidebar}</MobileNav>

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-sidebar print:pl-0">
        <main
          id="main"
          className="mx-auto w-full max-w-shell flex-1 px-4 py-8 md:px-6 xl:px-10 xl:py-10 print:max-w-none print:p-0"
        >
          {children}
        </main>
        <LegalFooter data-print="hide" className="border-t px-4 py-4 md:px-8" />
      </div>
    </div>
  )
}
