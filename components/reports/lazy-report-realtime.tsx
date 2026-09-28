'use client'

import dynamic from 'next/dynamic'

/**
 * `ReportRealtime` renders `null`. It exists only to open a websocket and
 * refresh the page when the job finishes somewhere else.
 *
 * Imported statically it was pulling `@supabase/supabase-js` — postgrest, storage,
 * functions and the whole realtime client — into the report route's first load,
 * for a component with no output. Measured at ~100 kB of the route's 226 kB.
 *
 * `ssr: false` costs nothing: a websocket cannot open during server rendering
 * anyway, and there is no markup to lose. The listener now connects a moment
 * after the page is interactive, which is indistinguishable for an event that
 * happens once, minutes later.
 *
 * `next/dynamic` with `ssr: false` is not allowed inside a Server Component,
 * which is why this thin client module exists rather than the page calling
 * `dynamic` itself.
 */
export const ReportRealtime = dynamic(
  () => import('./report-realtime').then((module) => module.ReportRealtime),
  { ssr: false },
)
