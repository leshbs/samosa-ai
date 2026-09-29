import Link from 'next/link'
import { cn } from '@/lib/utils'

export const SETTINGS_TABS = [
  { id: 'organisasi', label: 'Organisasi' },
  { id: 'anggota', label: 'Anggota' },
  { id: 'pemakaian', label: 'Pemakaian' },
  { id: 'laporan', label: 'Laporan' },
  { id: 'notifikasi', label: 'Notifikasi' },
  { id: 'data', label: 'Data & Privasi' },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id']

/** Anything that is not a known tab — a typo, an old link — opens the first. */
export function parseSettingsTab(value: unknown): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab.id === value)?.id ?? 'organisasi'
}

/**
 * Checklist 5.1: one page, six tabs, the tab in the URL. Links rather than a
 * client-side tab widget, so a tab can be bookmarked, shared in a chat ("buka
 * Pengaturan → Anggota"), and opened from an email; the back button walks
 * back through the tabs visited, which is what people expect of a URL.
 *
 * Every role sees all six. What differs inside is which actions exist (§5:
 * hide what you cannot do), not which parts of the settings you may read.
 */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav aria-label="Bagian pengaturan" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b px-1">
        {SETTINGS_TABS.map((tab) => {
          const current = tab.id === active
          return (
            <li key={tab.id}>
              <Link
                href={`/settings?tab=${tab.id}`}
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  current
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
