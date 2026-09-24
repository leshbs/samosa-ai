import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { QueryProvider } from '@/components/layout/query-provider'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

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
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider nonce={nonce}>
          <QueryProvider>{children}</QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
