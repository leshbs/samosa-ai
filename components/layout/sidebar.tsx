import { Logo } from '@/components/brand/logo'
import { SidebarNav, type SidebarCounts } from '@/components/layout/sidebar-nav'
import {
  SidebarAccountMenu,
  type ShellWorkspace,
} from '@/components/layout/sidebar-account-menu'

export type ShellUser = {
  email: string
  displayName: string
  organizationName: string
  /** One person, nobody invited: the shell shows them, not an organization. */
  solo: boolean
  /** The active workspace, and every workspace the person can switch to. */
  organizationId: string
  workspaces: ShellWorkspace[]
}

/**
 * The sidebar's contents, rendered twice by the shell: fixed on desktop, and
 * inside the drawer below 1024px. A Server Component, so the only JavaScript it
 * brings is the two client islands inside it: the nav and the account menu.
 */
export function Sidebar({
  user,
  counts,
  canCreate,
}: {
  user: ShellUser
  counts: SidebarCounts
  canCreate: boolean
}) {
  return (
    <div className="flex h-full w-full flex-col bg-ink-950 bg-grad-sidebar text-white dark:border-r dark:border-white/[0.06]">
      <div className="px-5 pb-8 pt-6">
        <Logo href="/dashboard" tone="onDark" />
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <SidebarNav counts={counts} canCreate={canCreate} />
      </div>

      {/* §8.1 block 4. The account menu hangs off the organization: one row
          until clicked, so the navigation keeps the sidebar to itself. */}
      <div className="pt-4">
        <SidebarAccountMenu
          email={user.email}
          displayName={user.displayName}
          organizationName={user.organizationName}
          solo={user.solo}
          organizationId={user.organizationId}
          workspaces={user.workspaces}
        />
      </div>
    </div>
  )
}
