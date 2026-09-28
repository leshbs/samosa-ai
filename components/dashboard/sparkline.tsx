'use client'

import * as m from 'motion/react-m'
import { EASE } from '@/components/motion/motion-provider'
import { formatShare } from '@/lib/utils'

const WIDTH = 120
const HEIGHT = 36
const PAD = 3

/**
 * Positive share across the last few reports (design_system.md §10.3).
 *
 * Solid teal, no fill under the line: a gradient area would suggest a volume
 * where there is only a ratio. The y axis is the data's own range, not 0–100%,
 * because the question a sparkline answers is "which way is it moving" — the
 * card's big number already carries the magnitude, and it starts at zero.
 *
 * The line draws once on mount (§6: charts animate once). Screen readers get
 * the values as a sentence instead of an unlabelled picture.
 */
export function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (WIDTH - PAD * 2) / (values.length - 1)

  const points = values.map((value, index) => ({
    x: PAD + index * step,
    y: PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2),
  }))
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ')
  const last = points[points.length - 1]

  return (
    <>
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-9 w-[120px] overflow-visible text-teal-500 dark:text-teal-300"
      >
        <m.path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
        />
        {last ? (
          <m.circle
            cx={last.x}
            cy={last.y}
            r={3}
            fill="currentColor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.75 }}
          />
        ) : null}
      </svg>
      <span className="sr-only">
        Tren sentimen positif, dari laporan terlama ke terbaru:{' '}
        {values.map(formatShare).join(', ')}.
      </span>
    </>
  )
}
