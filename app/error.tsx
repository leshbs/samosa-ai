'use client'

import Link from 'next/link'
import { ErrorState } from '@/components/layout/error-state'
import { Button } from '@/components/ui/button'

/**
 * Catches anything thrown below the root layout that a nested boundary did not
 * already handle — in practice the public pages, since the dashboard has its
 * own boundary inside the shell.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md">
        <ErrorState error={error} reset={reset} />
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href="/">Kembali ke beranda</Link>
      </Button>
    </main>
  )
}
