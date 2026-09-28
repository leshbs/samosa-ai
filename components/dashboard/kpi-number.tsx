'use client'

import { CountUp } from '@/components/motion/primitives'
import { formatShare } from '@/lib/utils'

const NUMBER = new Intl.NumberFormat('id-ID')

/**
 * Formatters live on this side of the boundary because a Server Component
 * cannot hand a function to a Client Component — the page passes a name and
 * the formatter is chosen here.
 */
const FORMATS = {
  count: (value: number) => NUMBER.format(Math.round(value)),
  share: formatShare,
} as const

export function KpiNumber({
  value,
  kind,
}: {
  value: number
  kind: keyof typeof FORMATS
}) {
  return <CountUp value={value} format={FORMATS[kind]} />
}
