'use client'

import { useLinkStatus } from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Feedback the moment a link is pressed, before the server has answered.
 *
 * Pilot 01 (§2.1): switching tabs felt stuck for seconds. Route changes have
 * loading.tsx skeletons, but a link that only changes the query string —
 * settings tabs, pagination — stays on the same route, so no skeleton shows
 * and nothing moves until the new page arrives. This mark moves at once.
 *
 * Must be rendered inside the <Link> it reports on.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none transition-opacity duration-fast',
        pending ? 'animate-pulse opacity-100' : 'opacity-0',
        className,
      )}
    />
  )
}
