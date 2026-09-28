'use client'

import { Search, X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import * as m from 'motion/react-m'
import { SentimentBadge } from '@/components/analysis/sentiment-badge'
import { SENTIMENT_LABELS, SENTIMENT_ORDER } from '@/components/charts/palette'
import { EASE } from '@/components/motion/motion-provider'
import {
  EXPLORER_ANCHOR_ID,
  useExplorerFocus,
  type ExplorerFocus,
} from '@/components/reports/explorer-focus'
import { Badge, filterChipVariants } from '@/components/ui/badge'
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
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatPercent } from '@/lib/utils'
import type { Sentiment } from '@/types/domain'

const PAGE_SIZE = 20

/** Below this, confidence is labelled rather than left to the reader (§11). */
const LOW_CONFIDENCE = 0.6

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

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

const NO_FOCUS: ExplorerFocus = { sentiments: [], topics: [], query: '' }

/**
 * §8. Search, sentiment filter, topic chips, confidence sort, 20 per page, no
 * infinite scroll — a report is read in pages and cited by position.
 *
 * The sentiment and topic filters live in `ExplorerFocusProvider` rather than in
 * this component, so a stat tile or a chart bar can set them (§7 P1). When there
 * is no provider the component falls back to its own state and behaves exactly
 * as it did before, which is what lets it be reused outside the report page.
 */
export function ResponseExplorer({
  rows,
  topics,
}: {
  rows: ExplorerRow[]
  /** Topic vocabulary for the filter, already normalized and ranked. */
  topics: string[]
}) {
  const context = useExplorerFocus()
  const [localFocus, setLocalFocus] = useState<ExplorerFocus>(NO_FOCUS)
  const focus = context?.focus ?? localFocus
  const setFocus = context?.setFocus ?? setLocalFocus

  const [sort, setSort] = useState<Sort>('dataset')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<ExplorerRow | null>(null)

  const query = focus.query
  const setQuery = (next: string) => setFocus((current) => ({ ...current, query: next }))

  /**
   * Filtering scans every response's text, topics and keywords. On a 2,000-row
   * dataset that is long enough to drop typed characters, so the input updates
   * immediately and the table catches up: React keeps the previous results on
   * screen while the new ones are computed instead of blocking the keystroke.
   */
  const deferredQuery = useDeferredValue(query)
  const stale = deferredQuery !== query

  // A tile or chart bar changing the filter must not land the reader on page 7
  // of a list that is now three rows long.
  useEffect(() => {
    setPage(0)
  }, [focus, deferredQuery, sort])

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()

    const matched = rows.filter((row) => {
      if (focus.sentiments.length > 0 && !focus.sentiments.includes(row.sentiment)) {
        return false
      }
      if (
        focus.topics.length > 0 &&
        // Any-of, not all-of: picking two topics widens the view, which is
        // what a multi-select reads as.
        !row.topics.some((topic) => focus.topics.includes(topic.toLowerCase().trim()))
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
  }, [rows, deferredQuery, focus, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // The filter may have shrunk the list under the current page; clamp on read
  // rather than in an effect, so there is never a frame showing an empty page.
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const hasFilters =
    query.length > 0 || focus.sentiments.length > 0 || focus.topics.length > 0

  function reset() {
    setFocus(NO_FOCUS)
    setPage(0)
  }

  return (
    <Card id={EXPLORER_ANCHOR_ID} className="scroll-mt-40">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">Jelajah aspirasi</CardTitle>
        <p className="text-sm text-muted-foreground">
          Setiap angka di laporan ini berasal dari baris-baris di bawah. Klik satu baris
          untuk melihat teks lengkapnya.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          data-print="hide"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              className="h-9 rounded-control border bg-background px-2 text-sm text-foreground"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Sentimen
          </span>
          {SENTIMENT_ORDER.map((sentiment) => (
            <button
              key={sentiment}
              type="button"
              aria-pressed={focus.sentiments.includes(sentiment)}
              onClick={() =>
                setFocus((current) => ({
                  ...current,
                  sentiments: toggle(current.sentiments, sentiment),
                }))
              }
              className={filterChipVariants({
                active: focus.sentiments.includes(sentiment),
              })}
            >
              {SENTIMENT_LABELS[sentiment]}
            </button>
          ))}
        </div>

        {topics.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2" data-print="hide">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Topik
            </span>
            {topics.map((topic) => (
              <button
                key={topic}
                type="button"
                aria-pressed={focus.topics.includes(topic)}
                onClick={() =>
                  setFocus((current) => ({
                    ...current,
                    topics: toggle(current.topics, topic),
                  }))
                }
                className={filterChipVariants({ active: focus.topics.includes(topic) })}
              >
                {topic}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p aria-live="polite" className={cn(stale && 'opacity-60')}>
            {filtered.length} dari {rows.length} aspirasi
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={reset} data-print="hide">
              <X aria-hidden />
              Hapus filter
            </Button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          /* §10: an empty result teaches the way out of it. */
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Tidak ada aspirasi yang cocok dengan filter ini.
            </p>
            <Button variant="outline" size="sm" onClick={reset}>
              Hapus semua filter
            </Button>
          </div>
        ) : (
          <div className={cn('transition-opacity', stale && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Sentimen</TableHead>
                  <TableHead>Aspirasi</TableHead>
                  <TableHead className="hidden w-48 md:table-cell">Topik</TableHead>
                </TableRow>
              </TableHeader>
              {/* Keyed on the page so a page turn fades rather than swapping
                  twenty rows of text in one frame. */}
              <m.tbody
                key={`${currentPage}-${filtered.length}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="[&_tr:last-child]:border-0"
              >
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
                        {row.confidence < LOW_CONFIDENCE ? (
                          <span className="block text-notice">keyakinan rendah</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="line-clamp-2">{row.responseText}</span>
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {row.topics.map((topic) => (
                          <Badge key={topic} variant="muted">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </m.tbody>
            </Table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between" data-print="hide">
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
                  {open.confidence < LOW_CONFIDENCE
                    ? ' · keyakinan rendah, periksa manual'
                    : ''}
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

function DetailTerms({ title, terms }: { title: string; terms: string[] }) {
  if (terms.length === 0) return null

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        {terms.map((term) => (
          <Badge key={term} variant="muted">
            {term}
          </Badge>
        ))}
      </div>
    </div>
  )
}
