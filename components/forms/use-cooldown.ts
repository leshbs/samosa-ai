'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Seconds left before an email can be requested again. Supabase refuses a
 * second email to the same address within 60 seconds anyway; counting down in
 * the button says so up front instead of as an error after the click.
 */
export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])

  const start = useCallback(() => setRemaining(seconds), [seconds])

  return { remaining, start }
}
