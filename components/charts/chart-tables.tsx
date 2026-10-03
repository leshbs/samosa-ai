import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPercent } from '@/lib/utils'
import type {
  CountedTerm,
  SentimentDistribution,
  TopicSentimentRow,
} from '@/modules/reporting'
import { SENTIMENT_LABELS, SENTIMENT_ORDER } from './palette'

/** The table twin of `SentimentBar`. */
export function SentimentTable({ data }: { data: SentimentDistribution }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sentimen</TableHead>
          <TableHead className="text-right">Aspirasi</TableHead>
          <TableHead className="text-right">Porsi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SENTIMENT_ORDER.map((sentiment) => (
          <TableRow key={sentiment}>
            <TableCell>{SENTIMENT_LABELS[sentiment]}</TableCell>
            <TableCell className="text-right tabular-nums">
              {data.counts[sentiment]}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(data.shares[sentiment], 1)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The table twin of `KeywordBar` — and of any other ranked-term chart. */
export function TermTable({
  terms,
  header,
  countHeader = 'Aspirasi',
}: {
  terms: CountedTerm[]
  header: string
  /** What one counted row is called. */
  countHeader?: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-right">#</TableHead>
          <TableHead>{header}</TableHead>
          <TableHead className="text-right">{countHeader}</TableHead>
          <TableHead className="text-right">Porsi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {terms.map((term, index) => (
          <TableRow key={term.term}>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {index + 1}
            </TableCell>
            <TableCell className="font-medium">{term.term}</TableCell>
            <TableCell className="text-right tabular-nums">{term.count}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(term.share, 1)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The table twin of `TopicBar` — the sentiment × topic cross-tab in full. */
export function TopicSentimentTable({ rows }: { rows: TopicSentimentRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topik</TableHead>
          {SENTIMENT_ORDER.map((sentiment) => (
            <TableHead key={sentiment} className="text-right">
              {SENTIMENT_LABELS[sentiment]}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.topic}>
            <TableCell className="font-medium">{row.topic}</TableCell>
            {SENTIMENT_ORDER.map((sentiment) => (
              <TableCell key={sentiment} className="text-right tabular-nums">
                {row.counts[sentiment]}
              </TableCell>
            ))}
            <TableCell className="text-right font-medium tabular-nums">
              {row.total}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
