'use client'

import * as React from 'react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EASE } from '@/components/motion/motion-provider'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'
import type { InsightSignal, ReportInsight } from '@/types/domain'

/**
 * Findings shown before "Lihat semua". The number of findings comes from the
 * data (C.4), so a report may have thirty; the reader chooses how many to see,
 * not how many exist (pilot-01-findings.md §5).
 */
export const VISIBLE_INSIGHTS = 5

const SIGNAL_LABELS: Record<InsightSignal, string | null> = {
  topic: null,
  split: 'Pendapat terbelah',
  negative: 'Hampir semua negatif',
}

/**
 * §6.4 — insight cards, a section of their own rather than a list inside the
 * executive summary. They are the part of the report that makes a claim, so they
 * are also the part that has to show its evidence (§7 P1: evidence opens
 * inline).
 *
 * Each card's evidence is a chip per cited response. Clicking one expands the
 * aspiration underneath it, in place — not a modal, because the reader is
 * checking a claim against a quote and needs both on screen at once.
 *
 * `quotes` holds only the responses these insights actually cite. The report page
 * has every response in memory, and passing all of them into this client
 * component would put the whole dataset's text into the page payload a second
 * time for the sake of a dozen lookups.
 */
export function InsightCards({
  insights,
  quotes,
  questions = [],
}: {
  insights: ReportInsight[]
  quotes: Record<string, string>
  /**
   * The report's questions, when it has several: a card then says which one
   * its finding comes from (pilot 01, §4.4). Empty for a one-question report,
   * where there is nothing to tell apart.
   */
  questions?: ReadonlyArray<{ id: string; text: string }>
}) {
  const [showAll, setShowAll] = React.useState(false)
  if (insights.length === 0) return null

  // Findings picked from the data carry their count; older ones were chosen
  // by the model from a sample and are described as such.
  const counted = insights.some((insight) => insight.support !== undefined)
  const shown = showAll ? insights : insights.slice(0, VISIBLE_INSIGHTS)
  const hidden = insights.length - VISIBLE_INSIGHTS

  const originOf = (insight: ReportInsight) =>
    insight.questionId
      ? (questions.find((question) => question.id === insight.questionId)?.text ?? null)
      : null

  return (
    <section aria-labelledby="insights-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="insights-heading" className="text-lg font-semibold">
          Temuan utama
        </h2>
        <p className="max-w-narrative text-sm text-muted-foreground">
          {counted
            ? 'Tiap temuan adalah tema atau topik yang disebut cukup banyak jawaban, diurutkan dari yang paling sering. Ditulis AI dan bersandar pada minimal dua kutipan; buka kutipannya untuk memeriksa.'
            : 'Disusun AI dari angka agregat dan contoh aspirasi. Buka kutipannya untuk memeriksa dasar setiap temuan.'}
        </p>
      </div>

      <Stagger className="grid gap-4 lg:grid-cols-2">
        {shown.map((insight, index) => (
          <StaggerItem key={`${insight.title}-${index}`}>
            <InsightCard
              insight={insight}
              quotes={quotes}
              index={index}
              origin={originOf(insight)}
            />
          </StaggerItem>
        ))}
      </Stagger>

      {hidden > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showAll}
          onClick={() => setShowAll((open) => !open)}
        >
          {showAll
            ? `Tampilkan ${VISIBLE_INSIGHTS} teratas`
            : `Lihat semua (${insights.length})`}
        </Button>
      ) : null}
    </section>
  )
}

function InsightCard({
  insight,
  quotes,
  index,
  origin,
}: {
  insight: ReportInsight
  quotes: Record<string, string>
  index: number
  /** The question the finding comes from; null when none is named. */
  origin: string | null
}) {
  // Only ids that still resolve to a response are offered; an insight whose
  // evidence was deleted loses the quote, not the insight.
  const evidence = React.useMemo(
    () =>
      insight.evidenceResponseIds
        .map((id) => ({ id, text: quotes[id] }))
        .filter((item): item is { id: string; text: string } => Boolean(item.text)),
    [insight.evidenceResponseIds, quotes],
  )

  const [openId, setOpenId] = React.useState<string | null>(null)
  const open = evidence.find((item) => item.id === openId)
  const signal = insight.signal ? SIGNAL_LABELS[insight.signal] : null

  return (
    <Card className="flex h-full flex-col" data-print="keep-together">
      <CardContent className="flex flex-1 flex-col gap-3 py-5">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="text-xs font-semibold tabular-nums text-muted-foreground"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className="text-sm font-semibold leading-snug">{insight.title}</h3>
        </div>

        {origin ? (
          <p className="line-clamp-2 text-xs text-muted-foreground" title={origin}>
            <span className="font-medium">Dari pertanyaan:</span> {origin}
          </p>
        ) : null}

        {insight.support !== undefined ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">
              Disebut di {insight.support} jawaban
            </span>
            {signal ? (
              <span className="rounded-chip border px-1.5 py-0.5 font-medium">
                {signal}
              </span>
            ) : null}
            {insight.topics && insight.topics.length > 1 ? (
              <span>mencakup {insight.topics.join(', ')}</span>
            ) : null}
          </p>
        ) : null}

        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          {insight.detail}
        </p>

        {evidence.length === 0 ? (
          /* §11: a claim with no quote behind it says so, rather than looking
             identical to one that is grounded. */
          <p className="text-xs text-muted-foreground/80">
            Dari angka agregat, tanpa kutipan spesifik.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Dasar:</span>
              {evidence.map((item, position) => {
                const isOpen = item.id === openId
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isOpen
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Quote aria-hidden className="size-3" />
                    Kutipan {position + 1}
                  </button>
                )
              })}
            </div>

            <AnimatePresence initial={false} mode="wait">
              {open ? (
                <m.blockquote
                  key={open.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <span className="block border-l-2 border-primary/40 pl-3 text-xs italic leading-relaxed text-muted-foreground">
                    {open.text}
                  </span>
                </m.blockquote>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
