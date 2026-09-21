import type { Sentiment } from '@/types/domain'

/**
 * Colour alone would exclude colour-blind readers, so each sentiment also
 * carries its own word.
 *
 * The hues are the chart palette's, not a second set: when the pie says
 * "positive is blue" and the badge below it says "positive is green", a reader
 * scanning between the two has to re-learn the code halfway down the page.
 */
const LABELS: Record<Sentiment, string> = {
  positive: 'Positif',
  neutral: 'Netral',
  negative: 'Negatif',
}

const TOKENS: Record<Sentiment, { bg: string; fg: string }> = {
  positive: {
    bg: 'var(--sentiment-positive-bg)',
    fg: 'var(--sentiment-positive-fg)',
  },
  neutral: { bg: 'var(--sentiment-neutral-bg)', fg: 'var(--sentiment-neutral-fg)' },
  negative: {
    bg: 'var(--sentiment-negative-bg)',
    fg: 'var(--sentiment-negative-fg)',
  },
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const token = TOKENS[sentiment]

  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: token.bg, color: token.fg }}
    >
      {LABELS[sentiment]}
    </span>
  )
}
