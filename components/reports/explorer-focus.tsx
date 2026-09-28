'use client'

import * as React from 'react'
import type { Sentiment } from '@/types/domain'

/**
 * Carries "show me the responses behind this number" from whatever was clicked
 * down to the Response Explorer (§7 P1: every metric must open its supporting
 * evidence).
 *
 * A React context rather than URL state on purpose. The report is a Server
 * Component, so putting the filter in the query string would round-trip to the
 * server and re-run the aggregation for what is a client-side filter over data
 * the browser already holds — a visibly slower interaction that also loses the
 * user's scroll position. The trade-off is that a focused view is not
 * shareable by link; the explorer's own controls remain the way to reach any
 * filter, so nothing is only reachable through a click on a chart.
 */
export const EXPLORER_ANCHOR_ID = 'response-explorer'

export type ExplorerFocus = {
  sentiments: Sentiment[]
  topics: string[]
  /**
   * The free-text term. It lives here rather than in the explorer's own state so
   * the keyword chart can drive it: a keyword is not a filter dimension in the
   * data model — keywords are per-response strings, not a controlled vocabulary —
   * so "show me responses mentioning this word" is a search, and the search box
   * is where the reader can then see and edit what was applied.
   */
  query: string
}

const EMPTY: ExplorerFocus = { sentiments: [], topics: [], query: '' }

type ExplorerFocusValue = {
  focus: ExplorerFocus
  /** Replaces the filter and scrolls the explorer into view. */
  focusOn: (next: Partial<ExplorerFocus>) => void
  /** Used by the explorer's own controls, which must not re-scroll the page. */
  setFocus: React.Dispatch<React.SetStateAction<ExplorerFocus>>
  clear: () => void
}

const ExplorerFocusContext = React.createContext<ExplorerFocusValue | null>(null)

export function ExplorerFocusProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = React.useState<ExplorerFocus>(EMPTY)

  const focusOn = React.useCallback((next: Partial<ExplorerFocus>) => {
    // Replaces rather than merges: clicking a topic bar after clicking a
    // sentiment tile should show that topic, not the two intersected down to
    // nothing. Compounding filters is what the explorer's own chips are for.
    setFocus({
      sentiments: next.sentiments ?? [],
      topics: next.topics ?? [],
      query: next.query ?? '',
    })

    // Deferred a frame so the explorer has re-rendered with the new filter
    // before it is scrolled to; otherwise the page lands on the old row count
    // and then reflows underneath the reader.
    requestAnimationFrame(() => {
      document
        .getElementById(EXPLORER_ANCHOR_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const clear = React.useCallback(() => setFocus(EMPTY), [])

  const value = React.useMemo(
    () => ({ focus, focusOn, setFocus, clear }),
    [focus, focusOn, clear],
  )

  return (
    <ExplorerFocusContext.Provider value={value}>
      {children}
    </ExplorerFocusContext.Provider>
  )
}

/**
 * Returns null outside a provider rather than throwing, so a chart or tile can
 * be rendered on a page that has no explorer (the analysis detail page reuses
 * the sentiment bar) without the caller branching.
 */
export function useExplorerFocus(): ExplorerFocusValue | null {
  return React.useContext(ExplorerFocusContext)
}
