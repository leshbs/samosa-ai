'use client'

import {
  BarChart3,
  Database,
  LayoutGrid,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SidebarCounts = { datasets: number | null; reports: number | null }

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  count?: keyof SidebarCounts
  /** Hidden — not disabled — for roles that cannot use it (§8.1). */
  requiresCreate?: boolean
}

/**
 * design_system.md §8.1. `/analysis` is deliberately absent: a job is a
 * transitional state reached from a dataset, and a "jobs" entry would make
 * people learn our plumbing. Beranda points at /dashboard because / is the
 * public landing page here.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Beranda', icon: LayoutGrid },
  { href: '/datasets', label: 'Dataset', icon: Database, count: 'datasets' },
  { href: '/reports', label: 'Laporan', icon: BarChart3, count: 'reports' },
  { href: '/datasets/new', label: 'Analisis Baru', icon: Plus, requiresCreate: true },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
]

/** 44px rows with a 4px gap; the sliding highlight is positioned from these. */
const ROW = 44
const GAP = 4

/**
 * The longest matching href wins, so /datasets/new lights "Analisis Baru" and
 * not "Dataset", while /datasets/<id> still lights "Dataset".
 */
function activeIndex(items: readonly NavItem[], pathname: string): number {
  let best = -1
  items.forEach((item, index) => {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (matches && (best === -1 || item.href.length > (items[best]?.href.length ?? 0))) {
      best = index
    }
  })
  return best
}

export function SidebarNav({
  counts,
  canCreate,
}: {
  counts: SidebarCounts
  canCreate: boolean
}) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => canCreate || !item.requiresCreate)
  const active = activeIndex(items, pathname)

  return (
    <nav aria-label="Navigasi utama">
      <p className="eyebrow px-3.5 pb-3 text-white/50">Workspace</p>
      <ul className="relative flex flex-col gap-1">
        {/* One highlight that slides between rows instead of one per row
            snapping on and off. A transform on a single element: no layout,
            no JS, and the CSS reduced-motion rule makes it jump instead. */}
        <li
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-11 rounded-lg bg-white/10 transition-[transform,opacity] duration-base ease-soft',
            active === -1 && 'opacity-0',
          )}
          style={{ transform: `translateY(${Math.max(active, 0) * (ROW + GAP)}px)` }}
        >
          <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-ember-500" />
        </li>

        {items.map(({ href, label, icon: Icon, count }, index) => {
          const isActive = index === active
          const value = count ? counts[count] : null

          return (
            <li key={href} className="relative">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-lg px-3.5 text-sm transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
                  isActive
                    ? 'font-semibold text-white'
                    : 'font-medium text-white/70 hover:bg-white/[0.06] hover:text-white/95',
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    'size-[18px] shrink-0 transition-colors duration-fast',
                    isActive && 'text-ember-500',
                  )}
                />
                <span className="flex-1 truncate">{label}</span>
                {value !== null && value !== undefined ? (
                  <span className="rounded-full bg-white/[0.08] px-2 py-0.5 font-mono text-micro text-white/70">
                    {value}
                    <span className="sr-only"> {label.toLowerCase()}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
