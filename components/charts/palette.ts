import type { Sentiment } from '@/types/domain'

/**
 * Charts read their colours from CSS custom properties rather than from a
 * theme hook. The server cannot know the visitor's theme, so anything derived
 * from it in JavaScript has to wait for hydration — and a chart that repaints
 * after first paint is both a flash and a hydration mismatch waiting to
 * happen. A `var()` in a `fill` attribute swaps with the `.dark` class, for
 * free, on the same frame as everything else.
 */
export const CHART_COLORS = {
  positive: 'var(--chart-positive)',
  neutral: 'var(--chart-neutral)',
  negative: 'var(--chart-negative)',
  series1: 'var(--chart-series-1)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  /** Stacked segments are separated by a gap in the surface colour, not a border. */
  surface: 'hsl(var(--card))',
} as const

/** Left-to-right order of the diverging scale: worst to best. */
export const SENTIMENT_ORDER = ['negative', 'neutral', 'positive'] as const

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: 'Positif',
  neutral: 'Netral',
  negative: 'Negatif',
}

export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: CHART_COLORS.positive,
  neutral: CHART_COLORS.neutral,
  negative: CHART_COLORS.negative,
}

/** Shared geometry, so every chart in the report uses the same marks. */
export const MARK = {
  /** 2px of surface between adjacent fills — a gap, never a stroke of ink. */
  gap: 2,
  radius: 4,
  axisFontSize: 12,
  /** Tall enough that a 24px pointer target fits over every row. */
  rowHeight: 28,
  /**
   * Set explicitly rather than via `barCategoryGap`: Recharts derives the gap
   * from the band height, so the same percentage produced a chunky bar in one
   * chart and a hairline in another. Half the row pitch leaves as much surface
   * between bars as bar.
   */
  barSize: 14,
} as const
