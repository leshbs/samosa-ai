'use client'

import { ArrowDownRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { CountUp } from '@/components/motion/primitives'
import { useExplorerFocus, type ExplorerFocus } from '@/components/reports/explorer-focus'
import { cn, formatPercent } from '@/lib/utils'

/**
 * A headline number is not a one-bar chart. Total responses, share positive and
 * the loudest topic each carry their own meaning and no comparison between them,
 * so they get tiles rather than a grouped bar.
 *
 * §7 P1 makes the tile the entry point to its own evidence: a tile with a `focus`
 * prop becomes a button that filters the Response Explorer to exactly the rows
 * behind its number and scrolls there. Tiles without one (a total, a dominant
 * label) stay inert rather than pretending to be clickable.
 */
/**
 * Formatters by name, not by reference: the report page is a server component,
 * and a function prop cannot cross into a client one — React refuses to
 * serialise it and the whole page fails with a digest-only error.
 */
const FORMATS = {
  count: (n: number) => String(Math.round(n)),
  percent: (n: number) => formatPercent(n),
} as const

export type StatFormat = keyof typeof FORMATS

export function StatTile({
  label,
  value,
  format = 'count',
  detail,
  focus,
  focusHint = 'Lihat aspirasinya',
}: {
  label: string
  /** A number animates; a string is rendered as-is. */
  value: number | string
  /** Applied to every animated frame and to the exact accessible value. */
  format?: StatFormat
  detail?: string
  /** Present means clickable: the filter this number stands for. */
  focus?: Partial<ExplorerFocus>
  focusHint?: string
}) {
  const explorer = useExplorerFocus()
  const interactive = Boolean(focus && explorer)

  const body = (
    <CardContent className="space-y-1 py-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold leading-tight">
        {typeof value === 'number' ? (
          <CountUp value={value} format={FORMATS[format]} />
        ) : (
          value
        )}
      </p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {interactive ? (
        <p
          data-print="hide"
          className="flex items-center gap-1 pt-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {focusHint}
          <ArrowDownRight aria-hidden className="size-3" />
        </p>
      ) : null}
    </CardContent>
  )

  if (!interactive || !focus || !explorer) {
    return <Card className="h-full">{body}</Card>
  }

  // A button rather than <Card asChild>: Card is a plain div, and widening it to
  // take a Slot for one caller would put a polymorphic prop on every card in the
  // app. The card classes are the shared token, so they are reused directly.
  return (
    <button
      type="button"
      onClick={() => explorer.focusOn(focus)}
      className={cn(
        'group block h-full w-full rounded-card border bg-card text-left text-card-foreground shadow-card',
        'cursor-pointer transition-colors hover:border-primary/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {body}
    </button>
  )
}
