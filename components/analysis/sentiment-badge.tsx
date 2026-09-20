import { cn } from '@/lib/utils'
import type { Sentiment } from '@/types/domain'

/**
 * Colour alone would exclude colour-blind readers, so each sentiment also
 * carries its own word.
 */
const STYLES: Record<Sentiment, { label: string; className: string }> = {
  positive: {
    label: 'Positif',
    className:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  neutral: {
    label: 'Netral',
    className: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  },
  negative: {
    label: 'Negatif',
    className: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  },
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const style = STYLES[sentiment]

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        style.className,
      )}
    >
      {style.label}
    </span>
  )
}
