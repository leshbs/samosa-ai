import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import {
  SettingsTabs,
  parseSettingsTab,
  settingsTabLabel,
} from '@/components/settings/settings-tabs'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/modules/auth'
import { DataTab } from './_tabs/data-tab'
import { MembersTab } from './_tabs/members-tab'
import { NotificationsTab } from './_tabs/notifications-tab'
import { OrganizationTab } from './_tabs/organization-tab'
import { ReportsTab } from './_tabs/reports-tab'
import { UsageTab } from './_tabs/usage-tab'

export const metadata: Metadata = { title: 'Pengaturan' }

const TAB_PANELS = {
  organisasi: OrganizationTab,
  anggota: MembersTab,
  pemakaian: UsageTab,
  laporan: ReportsTab,
  notifikasi: NotificationsTab,
  data: DataTab,
} as const

/**
 * Checklist 5.1: every organization setting on one page, the tab in the URL.
 * Only the active tab's panel is rendered, so opening "Pemakaian" does not
 * pay for the member list's email lookups.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')

  const tab = parseSettingsTab((await searchParams).tab)
  const Panel = TAB_PANELS[tab]

  return (
    <section className="mx-auto max-w-narrative space-y-6">
      <PageHeader
        title="Pengaturan"
        description={
          session.value.solo
            ? 'Pemakaian, laporan, dan datamu. Nama dan foto profilmu ada di halaman Profil.'
            : 'Organisasi, anggota, pemakaian, dan laporan. Nama dan foto profilmu ada di halaman Profil.'
        }
        crumbs={[{ label: 'Pengaturan' }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">Profil saya</Link>
          </Button>
        }
      />
      <SettingsTabs active={tab} solo={session.value.solo} />
      <div role="region" aria-label={settingsTabLabel(tab, session.value.solo)}>
        <Panel session={session.value} />
      </div>
    </section>
  )
}
