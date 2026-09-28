import { cn } from '@/lib/utils'

const TONES = {
  teal: 'border-teal-100 bg-teal-50 bg-grad-stat-teal dark:border-border',
  ember: 'border-ember-100 bg-ember-50 bg-grad-stat-ember dark:border-border',
  plain: 'bg-card',
} as const

/**
 * A headline number with one line of context (design_system.md §10.3).
 *
 * The tint is a 160° gradient barely a shade apart — lighting, not colour. The
 * cost card passes `plain`: money must read as a fact, not a promotion.
 *
 * Labels are ink-600, not the usual muted ink-500: on the darker end of the
 * teal and Ember tints ink-500 falls to 4.1–4.3:1.
 */
export function KpiCard({
  label,
  value,
  detail,
  tone = 'plain',
  aside,
  className,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: keyof typeof TONES
  /** Bottom-right slot, for the sparkline. */
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-4 rounded-card border p-5',
        TONES[tone],
        className,
      )}
    >
      <p className="text-label text-ink-600 dark:text-muted-foreground">{label}</p>
      <div className="space-y-1.5">
        {/* The aside shares a row with the number only, so the detail line
            below keeps the card's full width instead of wrapping beside it. */}
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0 text-stat text-foreground">{value}</p>
          {aside ? <div className="shrink-0 pb-0.5">{aside}</div> : null}
        </div>
        {detail ? (
          <p className="text-body-sm text-ink-600 dark:text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  )
}
