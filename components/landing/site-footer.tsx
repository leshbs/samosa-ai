import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

/**
 * design_system.md §11.2 · 11 and §8.4, trimmed to pages that exist. The spec
 * lists Harga, Blog, Changelog, Dokumentasi, Tentang and Kontak — none of which
 * have been built, and a footer of 404s is worse than a short footer. The
 * columns come back as the pages do.
 *
 * The legal links keep their full names: they are what the e2e suite and the
 * sign-up form point people at.
 */
const COLUMNS = [
  {
    title: 'Produk',
    links: [
      { label: 'Fitur', href: '#fitur' },
      { label: 'Cara kerja', href: '#cara-kerja' },
      { label: 'Contoh laporan', href: '#contoh' },
    ],
  },
  {
    title: 'Akun',
    links: [
      { label: 'Masuk', href: '/login' },
      { label: 'Daftar', href: '/signup' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Kebijakan Privasi', href: '/privacy' },
      { label: 'Ketentuan Layanan', href: '/terms' },
      { label: 'Privacy Policy (EN)', href: '/privacy?lang=en' },
      { label: 'Terms of Service (EN)', href: '/terms?lang=en' },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 px-6 pb-8 pt-16 text-sand-25 lg:px-10">
      <div className="mx-auto max-w-landing">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Logo tone="onDark" />
            <p className="max-w-[32ch] text-body-sm text-ink-300">
              Asisten analisis feedback untuk OSIS, MPK, dan panitia acara sekolah.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="space-y-4">
              <p className="eyebrow text-ink-400">{column.title}</p>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-ink-300 transition-colors duration-fast hover:text-sand-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-14 border-t border-white/[0.08] pt-6 text-micro text-ink-400">
          © {new Date().getFullYear()} SAMOSA — asisten analisis feedback
        </p>
      </div>
    </footer>
  )
}
