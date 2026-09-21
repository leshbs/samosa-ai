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
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {empty ? null : (
          <div
            role="group"
            aria-label={`Tampilan ${title}`}
            className="inline-flex shrink-0 rounded-md border p-0.5"
          >
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                aria-controls={panelId}
                onClick={() => setView(option.id)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition-colors',
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
        ) : view === 'chart' ? (
          children
        ) : (
          table
        )}
      </CardContent>
    </Card>
  )
}
