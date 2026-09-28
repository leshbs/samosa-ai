import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { headers } from 'next/headers'
import { MotionProvider } from '@/components/motion/motion-provider'
import { QueryProvider } from '@/components/layout/query-provider'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

/**
 * Plus Jakarta Sans for everything people read, JetBrains Mono for things that
 * must read as data — dates, IDs, costs, eyebrows (design_system.md §4.1).
 *
 * `display: 'swap'` so text is readable during the font load rather than
 * invisible; next/font self-hosts both files and generates metric-matched
 * fallbacks, so the swap does not shift layout. Both are variable fonts, so one
 * file covers every weight the type scale uses.
 *
 * The mono face is not preloaded: it only sets 11–12px labels, and preloading it
 * would put a second font request in front of the headline that is the page's
 * largest paint.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: 'SAMOSA',
    template: '%s · SAMOSA',
  },
  description: 'Mengubah ratusan aspirasi menjadi insight yang mudah dipahami.',
}

/**
 * Reading the nonce makes every route dynamic, which is the price of a CSP
 * without `unsafe-inline`. Measured on this app it is worth paying: the pages
 * are behind a session and already uncacheable, and the only static one is a
 * landing page with no data to fetch.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${jetbrains.variable} font-sans`}>
        <ThemeProvider nonce={nonce}>
          <QueryProvider>
            <MotionProvider>{children}</MotionProvider>
          </QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
