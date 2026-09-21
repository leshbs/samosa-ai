import { formatPercent } from '@/lib/utils'
import type { SentimentDistribution } from '@/modules/reporting'
import { SENTIMENT_COLORS, SENTIMENT_LABELS, SENTIMENT_ORDER } from './palette'

/**
 * Sentiment is an ordered scale, not a set of unrelated categories, so it is
 * drawn as one part-to-whole bar running negative → neutral → positive rather
 * than as a pie. Three slices of a pie ask the reader to compare angles; a
 * single bar puts the three shares on one line where the eye compares lengths,
 * and it survives being 320px wide on a phone.
 */
export function SentimentBar({ data }: { data: SentimentDistribution }) {
  if (data.total === 0) return null

  const segments = SENTIMENT_ORDER.map((sentiment) => ({
    sentiment,
    label: SENTIMENT_LABELS[sentiment],
    count: data.counts[sentiment],
    share: data.shares[sentiment],
  })).filter((segment) => segment.count > 0)

  return (
    <div className="space-y-4">
      <div
        role="img"
        aria-label={segments
          .map(
            (segment) =>
              `${segment.label} ${segment.count} dari ${data.total} (${formatPercent(segment.share)})`,
          )
          .join(', ')}
        className="flex h-12 w-full gap-0.5 overflow-hidden"
      >
        {segments.map((segment, index) => (
          <div
            key={segment.sentiment}
            style={{
              flexGrow: segment.share,
              backgroundColor: SENTIMENT_COLORS[segment.sentiment],
            }}
            className={[
              'min-w-0',
              index === 0 ? 'rounded-l' : '',
              index === segments.length - 1 ? 'rounded-r' : '',
            ].join(' ')}
          />
        ))}
      </div>

      {/* The values sit here rather than inside the bar: white on the
          negative step measures 3.4:1, under the 4.5:1 a 14px label needs, and
          the neutral step is lighter still. Labels beside the mark, in text
          tokens, are readable in both themes. */}
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {SENTIMENT_ORDER.map((sentiment) => (
          <li key={sentiment} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SENTIMENT_COLORS[sentiment] }}
            />
            <span className="text-muted-foreground">{SENTIMENT_LABELS[sentiment]}</span>
            <span className="font-medium tabular-nums">
              {data.counts[sentiment]}
              <span className="ml-1 font-normal text-muted-foreground">
                ({formatPercent(data.shares[sentiment])})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
