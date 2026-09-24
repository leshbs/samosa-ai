'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * `class` strategy to match tailwind.config.ts (`darkMode: ['class']`), and no
 * transition on change so the whole page does not fade when the theme flips.
 *
 * `nonce` is not optional in practice. next-themes writes an inline script to
 * set the theme class before first paint, and it is the one inline script on
 * the page that Next does not stamp itself — under our CSP it was blocked on
 * every route until the nonce was threaded through from the middleware.
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
