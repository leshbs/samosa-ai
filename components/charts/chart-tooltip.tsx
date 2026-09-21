'use client'

import type { TooltipProps } from 'recharts'

type Entry = { name?: string; value?: number; color?: string; dataKey?: string | number }

/**
 * One tooltip shape for every chart here, wearing the card tokens so it works
 * in both themes without a second palette.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: TooltipProps<number, string> & { formatValue?: (entry: Entry) => string }) {
  if (!active || !payload?.length) return null

  const entries = (payload as Entry[]).filter((entry) => (entry.value ?? 0) > 0)
  if (entries.length === 0) return null

  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-card-foreground">{label}</p>
      <ul className="space-y-0.5">
        {entries.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-card-foreground">
              {formatValue ? formatValue(entry) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
