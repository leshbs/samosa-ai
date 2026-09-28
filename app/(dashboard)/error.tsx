'use client'

import { ErrorState } from '@/components/layout/error-state'

/**
 * Keeps the shell — sidebar, header, theme — while one page fails, so a broken
 * report does not strand the user on a bare screen with no way out.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-md">
      <ErrorState error={error} reset={reset} />
    </div>
  )
}
