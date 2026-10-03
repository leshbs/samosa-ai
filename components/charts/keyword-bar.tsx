'use client'

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { KeywordCount } from '@/modules/reporting'
import { useExplorerFocus } from '@/components/reports/explorer-focus'
import { ChartTooltip } from './chart-tooltip'
import { CHART_COLORS, MARK } from './palette'

const AXIS_WIDTH = 132
const MAX_LABEL = 18

/** Recharts types its click state loosely; only this field is read. */
type ChartClickState = { activeLabel?: string | number }

/**
 * Keywords as ranked bars rather than a word cloud. A cloud encodes frequency
 * in glyph area — the one channel people are worst at comparing — packs words
 * at angles nobody can read, and gives a screen reader a soup of unordered
 * text. The bar keeps the ranking explicit and the numbers legible.
 *
 * Every bar wears the same hue: these are nominal terms, so colouring them by
 * their own count would re-encode the length people already see and spend the
 * identity channel on nothing.
 */
export function KeywordBar({
  keywords,
  focusAs = 'query',
  seriesName = 'Aspirasi',
  otherTopics = [],
  otherLabel,
}: {
  keywords: KeywordCount[]
  /**
   * What a click on a bar does to the explorer. `query` searches for the term;
   * `topics` filters to it. The same bars draw a question's topics, choices or
   * scale values when no sentiment splits them (ADR-0016), and those are a
   * filter dimension where a keyword is not.
   */
  focusAs?: 'query' | 'topics'
  /** What one counted row is, for the tooltip. */
  seriesName?: string
  /** Members of the "Lainnya" bar, so clicking it filters to all of them. */
  otherTopics?: readonly string[]
  /** That bar's label, passed in for the reason `TopicBar` gives. */
  otherLabel?: string
}) {
  const explorer = useExplorerFocus()

  /**
   * A keyword is not a filter dimension — keywords are free strings the model
   * pulled out of each response, not a controlled vocabulary — so clicking one
   * runs it as a search instead. The term lands in the search box where the
   * reader can see and edit what was applied, rather than in an invisible filter.
   */
  const handleClick = (state: ChartClickState) => {
    if (!explorer) return
    const label = state.activeLabel
    if (typeof label !== 'string' || label.length === 0) return

    if (focusAs === 'query') {
      explorer.focusOn({ query: label })
      return
    }
    if (otherLabel && label === otherLabel) {
      if (otherTopics.length > 0) explorer.focusOn({ topics: [...otherTopics] })
      return
    }
    explorer.focusOn({ topics: [label] })
  }

  return (
    <ResponsiveContainer width="100%" height={keywords.length * MARK.rowHeight + 40}>
      <BarChart
        data={keywords}
        layout="vertical"
        margin={{ top: 4, right: 36, bottom: 4, left: 0 }}
        onClick={handleClick}
        className={explorer ? 'cursor-pointer' : undefined}
      >
        {/* No gridlines: the x-axis is hidden because every bar carries its own
            number, and a grid with no scale beside it is decoration. */}
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="term"
          width={AXIS_WIDTH}
          stroke={CHART_COLORS.axis}
          tick={{ fontSize: MARK.axisFontSize, fill: CHART_COLORS.axis }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) =>
            value.length > MAX_LABEL ? `${value.slice(0, MAX_LABEL - 1)}…` : value
          }
        />
        <Tooltip
          cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.35 }}
          content={<ChartTooltip />}
        />
        <Bar
          barSize={MARK.barSize}
          dataKey="count"
          name={seriesName}
          fill={CHART_COLORS.series1}
          radius={[0, MARK.radius, MARK.radius, 0]}
          isAnimationActive={false}
        >
          {/* Outside the bar end, so a short bar never crops its own number. */}
          <LabelList
            dataKey="count"
            position="right"
            className="fill-muted-foreground"
            fontSize={MARK.axisFontSize}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
