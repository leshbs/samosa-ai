import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/datasets', label: 'Dataset' },
  { href: '/analysis', label: 'Analisis' },
  { href: '/reports', label: 'Laporan' },
] as const

export function AppShell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              SAMOSA
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <span className="text-sm text-muted-foreground">{email}</span>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  )
}
