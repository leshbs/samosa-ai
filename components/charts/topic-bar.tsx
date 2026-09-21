'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TopicSentimentRow } from '@/modules/reporting'
import type { Sentiment } from '@/types/domain'
import { ChartTooltip } from './chart-tooltip'
import {
  CHART_COLORS,
  MARK,
  SENTIMENT_COLORS,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
} from './palette'

const AXIS_WIDTH = 132
const MAX_LABEL = 18

type Row = { topic: string } & Record<Sentiment, number>

/**
 * Topics as horizontal bars, stacked by sentiment. Horizontal because topic
 * names are Indonesian noun phrases that do not fit under a vertical column,
 * and stacked because "which topic is loudest" and "which topic is angriest"
 * are the same question asked twice — splitting them into two charts would
 * make the reader hold one in their head while looking at the other.
 */
export function TopicBar({ rows }: { rows: TopicSentimentRow[] }) {
  const data: Row[] = rows.map((row) => ({ topic: row.topic, ...row.counts }))

  return (
    <ResponsiveContainer width="100%" height={rows.length * MARK.rowHeight + 72}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
        <XAxis
          type="number"
          allowDecimals={false}
          stroke={CHART_COLORS.axis}
          tick={{ fontSize: MARK.axisFontSize, fill: CHART_COLORS.axis }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="topic"
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
        <Legend
          verticalAlign="bottom"
          height={32}
          iconType="square"
          iconSize={10}
          formatter={(value: string) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
        {SENTIMENT_ORDER.map((sentiment, index) => (
          <Bar
            key={sentiment}
            barSize={MARK.barSize}
            dataKey={sentiment}
            name={SENTIMENT_LABELS[sentiment]}
            stackId="sentiment"
            fill={SENTIMENT_COLORS[sentiment]}
            // A stroke in the surface colour, not a border: it reads as the
            // 2px gap between segments that the marks spec asks for.
            stroke={CHART_COLORS.surface}
            strokeWidth={MARK.gap}
            radius={
              index === SENTIMENT_ORDER.length - 1
                ? [0, MARK.radius, MARK.radius, 0]
                : undefined
            }
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
