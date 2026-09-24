'use client'

import dynamic from 'next/dynamic'

/**
 * Recharts (and the d3 packages under it) was 109 kB of the report page's
 * 327 kB first load — the single heaviest thing in the app, on the one page a
 * school network is most likely to open on a phone.
 *
 * `ssr: false` costs nothing here. Recharts draws through `ResponsiveContainer`,
 * which measures its parent on mount and renders nothing at all on the server,
 * so the server HTML never contained a chart to begin with. What changes is
 * only *when* the code arrives: the stat tiles, the executive summary and the
 * sentiment bar (plain HTML, no Recharts) now paint without waiting for it.
 *
 * `next/dynamic` with `ssr: false` is not allowed inside a Server Component,
 * which is why this thin client module exists rather than the page importing
 * `dynamic` itself.
 */

/** Matches the drawn height of both charts, so nothing jumps when they land. */
function ChartPlaceholder() {
  return (
    <div className="h-[320px] w-full animate-pulse rounded-md bg-primary/5" aria-hidden />
  )
}

export const TopicBar = dynamic(
  () => import('./topic-bar').then((module) => module.TopicBar),
  { ssr: false, loading: ChartPlaceholder },
)

export const KeywordBar = dynamic(
  () => import('./keyword-bar').then((module) => module.KeywordBar),
  { ssr: false, loading: ChartPlaceholder },
)
