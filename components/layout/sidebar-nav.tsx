'use client'

import { BarChart3, Database, FileText, Home, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Beranda', icon: Home },
  { href: '/datasets', label: 'Dataset', icon: Database },
  { href: '/analysis', label: 'Analisis', icon: BarChart3 },
  { href: '/reports', label: 'Laporan', icon: FileText },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
] as const

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 md:flex-col" aria-label="Navigasi utama">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        // Prefix match so /datasets/<id> keeps the Dataset entry highlighted.
        const active = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
