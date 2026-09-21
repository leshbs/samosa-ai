'use client'

import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SentimentBadge } from '@/components/analysis/sentiment-badge'
import { SENTIMENT_LABELS, SENTIMENT_ORDER } from '@/components/charts/palette'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatPercent } from '@/lib/utils'
import type { Sentiment } from '@/types/domain'

const PAGE_SIZE = 20

export type ExplorerRow = {
  responseId: string
  responseText: string
  sentiment: Sentiment
  confidence: number
  topics: string[]
  keywords: string[]
  summary: string | null
}

const SORTS = [
  { id: 'dataset', label: 'Urutan dataset' },
  { id: 'confidence-desc', label: 'Keyakinan tertinggi' },
  { id: 'confidence-asc', label: 'Keyakinan terendah' },
] as const

type Sort = (typeof SORTS)[number]['id']

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function ResponseExplorer({
  rows,
  topics,
}: {
  rows: ExplorerRow[]
  /** Topic vocabulary for the filter, already normalized and ranked. */
  topics: string[]
}) {
  const [query, setQuery] = useState('')
  const [sentiments, setSentiments] = useState<Sentiment[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('dataset')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<ExplorerRow | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const matched = rows.filter((row) => {
      if (sentiments.length > 0 && !sentiments.includes(row.sentiment)) return false
      if (
        selectedTopics.length > 0 &&
        // Any-of, not all-of: picking two topics widens the view, which is
        // what a multi-select reads as.
        !row.topics.some((topic) => selectedTopics.includes(topic.toLowerCase().trim()))
      ) {
        return false
      }
      if (!needle) return true
      return (
        row.responseText.toLowerCase().includes(needle) ||
        (row.summary?.toLowerCase().includes(needle) ?? false) ||
        row.topics.some((topic) => topic.toLowerCase().includes(needle)) ||
        row.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
      )
    })

    if (sort === 'dataset') return matched
    // Sorting copies first: mutating `rows` in place would reorder the
    // caller's array and make "Urutan dataset" mean something different the
    // second time it is picked.
    return [...matched].sort((a, b) =>
      sort === 'confidence-desc'
        ? b.confidence - a.confidence
        : a.confidence - b.confidence,
    )
  }, [rows, query, sentiments, selectedTopics, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // The filter may have shrunk the list under the current page; clamp on read
  // rather than in an effect, so there is never a frame showing an empty page.
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const hasFilters =
    query.length > 0 || sentiments.length > 0 || selectedTopics.length > 0

  function reset() {
    setQuery('')
    setSentiments([])
    setSelectedTopics([])
    setPage(0)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jelajah aspirasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder="Cari teks, topik, atau kata kunci"
              aria-label="Cari aspirasi"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Urutkan
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Sentimen
          </span>
          {SENTIMENT_ORDER.map((sentiment) => (
            <FilterChip
              key={sentiment}
              active={sentiments.includes(sentiment)}
              onClick={() => {
                setSentiments(toggle(sentiments, sentiment))
                setPage(0)
              }}
            >
              {SENTIMENT_LABELS[sentiment]}
            </FilterChip>
          ))}
        </div>

        {topics.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Topik
            </span>
            {topics.map((topic) => (
              <FilterChip
                key={topic}
                active={selectedTopics.includes(topic)}
                onClick={() => {
                  setSelectedTopics(toggle(selectedTopics, topic))
                  setPage(0)
                }}
              >
                {topic}
              </FilterChip>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {filtered.length} dari {rows.length} aspirasi
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="mr-1 h-3.5 w-3.5" aria-hidden />
              Hapus filter
            </Button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Tidak ada aspirasi yang cocok dengan filter ini.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Sentimen</TableHead>
                <TableHead>Aspirasi</TableHead>
                <TableHead className="hidden w-48 md:table-cell">Topik</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow
                  key={row.responseId}
                  tabIndex={0}
                  role="button"
                  aria-haspopup="dialog"
                  onClick={() => setOpen(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setOpen(row)
                    }
                  }}
                  className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TableCell className="align-top">
                    <SentimentBadge sentiment={row.sentiment} />
                    <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                      {formatPercent(row.confidence)}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="line-clamp-2">{row.responseText}</span>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {row.topics.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Sebelumnya
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              Halaman {currentPage + 1} dari {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent>
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>Detail aspirasi</DialogTitle>
                <DialogDescription>
                  {SENTIMENT_LABELS[open.sentiment]} · keyakinan{' '}
                  {formatPercent(open.confidence)}
                </DialogDescription>
              </DialogHeader>
              <p className="whitespace-pre-wrap text-sm">{open.responseText}</p>
              {open.summary ? (
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                    Ringkasan
                  </h3>
                  <p className="mt-1 text-sm italic">{open.summary}</p>
                </div>
              ) : null}
              <DetailTerms title="Topik" terms={open.topics} />
              <DetailTerms title="Kata kunci" terms={open.keywords} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function DetailTerms({ title, terms }: { title: string; terms: string[] }) {
  if (terms.length === 0) return null

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        {terms.map((term) => (
          <span key={term} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
            {term}
          </span>
        ))}
      </div>
    </div>
  )
}
