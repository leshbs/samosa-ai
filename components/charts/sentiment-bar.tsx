'use client'

import { GrowBar } from '@/components/motion/primitives'
import { useExplorerFocus } from '@/components/reports/explorer-focus'
import { cn, formatPercent } from '@/lib/utils'
import type { SentimentDistribution } from '@/modules/reporting'
import type { Sentiment } from '@/types/domain'
import { SENTIMENT_COLORS, SENTIMENT_LABELS, SENTIMENT_ORDER } from './palette'

/**
 * Sentiment is an ordered scale, not a set of unrelated categories, so it is
 * drawn as one part-to-whole bar running negative → neutral → positive rather
 * than as a pie. Three slices of a pie ask the reader to compare angles; a
 * single bar puts the three shares on one line where the eye compares lengths,
 * and it survives being 320px wide on a phone.
 *
 * Plain HTML rather than a charting library, which is why it paints before
 * Recharts arrives and why its segments animate with a transform rather than a
 * redraw.
 *
 * §9 asks every chart to be clickable: each segment and each legend row filters
 * the Response Explorer to that sentiment. Without an `ExplorerFocusProvider`
 * above it the same markup renders as static spans, so the component is still
 * usable outside a report.
 */
export function SentimentBar({ data }: { data: SentimentDistribution }) {
  const explorer = useExplorerFocus()

  if (data.total === 0) return null

  const segments = SENTIMENT_ORDER.map((sentiment) => ({
    sentiment,
    count: data.counts[sentiment],
    share: data.shares[sentiment],
  })).filter((segment) => segment.count > 0)

  const describe = (sentiment: Sentiment) =>
    `${SENTIMENT_LABELS[sentiment]} ${data.counts[sentiment]} dari ${data.total} (${formatPercent(data.shares[sentiment])})`

  return (
    <div className="space-y-4">
      <div
        role={explorer ? 'group' : 'img'}
        aria-label={
          explorer
            ? 'Sebaran sentimen — klik satu bagian untuk memfilter tabel di bawah'
            : segments.map((segment) => describe(segment.sentiment)).join(', ')
        }
        className="flex h-12 w-full gap-0.5"
      >
        {segments.map((segment, index) => {
          const edges = cn(
            index === 0 && 'rounded-l',
            index === segments.length - 1 && 'rounded-r',
          )

          const fill = (
            <span
              aria-hidden
              className={cn('block h-full w-full overflow-hidden', edges)}
              style={{ backgroundColor: SENTIMENT_COLORS[segment.sentiment] }}
            >
              <GrowBar share={1} delay={index * 0.06} className="w-full" />
            </span>
          )

          if (!explorer) {
            return (
              <span
                key={segment.sentiment}
                className="block min-w-0"
                style={{ flexGrow: segment.share }}
              >
                {fill}
              </span>
            )
          }

          return (
            <button
              key={segment.sentiment}
              type="button"
              onClick={() => explorer.focusOn({ sentiments: [segment.sentiment] })}
              title={`${describe(segment.sentiment)} — klik untuk memfilter`}
              style={{ flexGrow: segment.share }}
              className={cn(
                'min-w-0 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                edges,
              )}
            >
              <span className="sr-only">{describe(segment.sentiment)}</span>
              {fill}
            </button>
          )
        })}
      </div>

      {/* The values sit here rather than inside the bar: white on the
          negative step measures 3.4:1, under the 4.5:1 a 14px label needs, and
          the neutral step is lighter still. Labels beside the mark, in text
          tokens, are readable in both themes. */}
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {SENTIMENT_ORDER.map((sentiment) => {
          const swatch = (
            <>
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: SENTIMENT_COLORS[sentiment] }}
              />
              <span className="text-muted-foreground">{SENTIMENT_LABELS[sentiment]}</span>
              <span className="font-medium tabular-nums">
                {data.counts[sentiment]}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({formatPercent(data.shares[sentiment])})
                </span>
              </span>
            </>
          )

          const clickable = Boolean(explorer) && data.counts[sentiment] > 0

          return (
            <li key={sentiment} className="text-sm">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => explorer?.focusOn({ sentiments: [sentiment] })}
                  className="flex items-center gap-2 rounded-chip px-1 py-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {swatch}
                </button>
              ) : (
                <span className="flex items-center gap-2 px-1 py-0.5">{swatch}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
