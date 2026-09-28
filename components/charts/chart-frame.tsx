'use client'

import { useId, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ChartFrameProps = {
  title: string
  description?: string
  /** The drawn view. */
  children: React.ReactNode
  /** The same numbers as a table — the accessible twin, never an afterthought. */
  table: React.ReactNode
  empty?: boolean
  emptyMessage?: string
}

const VIEWS = [
  { id: 'chart', label: 'Grafik' },
  { id: 'table', label: 'Tabel' },
] as const

type View = (typeof VIEWS)[number]['id']

/**
 * Every chart on the report ships with a table of the same numbers. Partly
 * that is accessibility — a bar is unreadable to a screen reader, and the
 * neutral sentiment step is deliberately low-contrast — and partly it is that
 * an OSIS member writing a proposal needs the figure, not the picture.
 *
 * Print always gets the table (§13). Recharts draws to a measured container, so
 * a printed chart is unreliable at best and blank at worst; the table is the
 * same data and survives a black-and-white printer. The print copy sits in a
 * `hidden print:block` wrapper, which keeps it out of the accessibility tree on
 * screen so a screen reader is not read both views.
 */
export function ChartFrame({
  title,
  description,
  children,
  table,
  empty = false,
  emptyMessage = 'Belum ada data untuk ditampilkan.',
}: ChartFrameProps) {
  const [view, setView] = useState<View>('chart')
  const panelId = useId()

  return (
    <Card data-print="keep-together">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {empty ? null : (
          <div
            role="group"
            aria-label={`Tampilan ${title}`}
            data-print="hide"
            className="inline-flex shrink-0 rounded-control border p-0.5"
          >
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                aria-controls={panelId}
                onClick={() => setView(option.id)}
                className={cn(
                  'rounded-chip px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === option.id
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent id={panelId}>
        {empty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <>
            <div className={view === 'chart' ? 'print:hidden' : undefined}>
              {view === 'chart' ? children : table}
            </div>
            {view === 'chart' ? <div className="hidden print:block">{table}</div> : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
