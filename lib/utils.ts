import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows Tailwind's default scale. Without these groups it
 * reads `text-eyebrow` as a text *colour*, so `cn('text-eyebrow', 'text-ink-500')`
 * silently dropped the font size — and `bg-grad-primary` as a background colour
 * that a later `bg-card` would erase.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-xl',
            'display-lg',
            'display-md',
            'display-sm',
            'h1',
            'h2',
            'h3',
            'h4',
            'body-lg',
            'body',
            'body-sm',
            'label',
            'mono-data',
            'stat',
            'eyebrow',
            'micro',
          ],
        },
      ],
      'bg-image': [
        {
          bg: [
            'grad-primary',
            'grad-primary-hover',
            'grad-primary-bright',
            'grad-banner',
            'grad-sidebar',
            'grad-hero-glow',
            'grad-stat-teal',
            'grad-stat-ember',
            'grad-divider',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'percent',
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** Below this, a rounded percentage hides differences worth seeing. */
const SMALL_SHARE = 0.1

/**
 * A 0–1 share in the design system's format (§4.3): one decimal below 10%
 * ("8,1%"), whole numbers above ("78%"). Comma decimals, as Indonesian readers
 * expect.
 */
export function formatShare(share: number): string {
  return formatPercent(share, share > 0 && share < SMALL_SHARE ? 1 : 0)
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
