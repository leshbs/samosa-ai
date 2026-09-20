'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * `class` strategy to match tailwind.config.ts (`darkMode: ['class']`), and no
 * transition on change so the whole page does not fade when the theme flips.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
