// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MotionProvider } from '@/components/motion/motion-provider'
import { ExplorerFocusProvider } from '@/components/reports/explorer-focus'
import {
  ResponseExplorer,
  type ExplorerRow,
} from '@/components/reports/response-explorer'
import { StatTile } from '@/components/reports/stat-tile'

/**
 * §7 P1 says every metric must open its supporting evidence. That wiring runs
 * through a React context rather than the URL, so none of it is visible to a
 * typecheck, and the end-to-end flow that would exercise it is skipped without
 * credentials. These tests are what actually prove a stat tile filters the table.
 *
 * Queries are scoped to wrappers rather than matched on accessible name, because
 * the tile and the explorer's own sentiment chip are both buttons reading
 * "Negatif" — which is correct in the product (one opens the evidence, one
 * toggles a filter) and ambiguous to a name-based query.
 */

const ROWS: ExplorerRow[] = [
  {
    responseId: 'r1',
    responseText: 'Konsumsinya telat hampir dua jam.',
    sentiment: 'negative',
    confidence: 0.91,
    topics: ['kualitas konsumsi'],
    keywords: ['konsumsi', 'telat'],
    summary: null,
  },
  {
    responseId: 'r2',
    responseText: 'Acaranya seru, panitianya ramah.',
    sentiment: 'positive',
    confidence: 0.95,
    topics: ['jalannya acara'],
    keywords: ['seru', 'ramah'],
    summary: null,
  },
  {
    responseId: 'r3',
    responseText: 'Acara dimulai pukul delapan di aula.',
    sentiment: 'neutral',
    confidence: 0.4,
    topics: ['jadwal acara'],
    keywords: ['aula'],
    summary: null,
  },
]

function Harness() {
  return (
    <MotionProvider>
      <ExplorerFocusProvider>
        <div data-testid="tile-negative">
          <StatTile
            label="Negatif"
            value={0.33}
            format="percent"
            detail="1 aspirasi"
            focus={{ sentiments: ['negative'] }}
          />
        </div>
        <div data-testid="tile-total">
          <StatTile label="Total aspirasi" value={3} />
        </div>
        <ResponseExplorer rows={ROWS} topics={['kualitas konsumsi', 'jalannya acara']} />
      </ExplorerFocusProvider>
    </MotionProvider>
  )
}

beforeAll(() => {
  // jsdom implements neither. The focus handler calls scrollIntoView, and
  // useInViewOnce deliberately falls back to "visible" with no
  // IntersectionObserver so content is never left animated away.
  Element.prototype.scrollIntoView = () => {}
})

/** The "N dari 3 aspirasi" counter, which is the explorer's own report of state. */
function visibleCount(): string {
  return screen.getByText(/dari 3 aspirasi/).textContent ?? ''
}

function negativeTile(): HTMLElement {
  return within(screen.getByTestId('tile-negative')).getByRole('button')
}

describe('evidence-first wiring', () => {
  it('filters the explorer to the sentiment behind a stat tile', () => {
    render(<Harness />)

    expect(visibleCount()).toContain('3 dari 3')
    expect(screen.getByText(/Acaranya seru/)).toBeTruthy()

    fireEvent.click(negativeTile())

    expect(visibleCount()).toContain('1 dari 3')
    expect(screen.getByText(/Konsumsinya telat/)).toBeTruthy()
    expect(screen.queryByText(/Acaranya seru/)).toBeNull()
  })

  it('leaves a tile with no focus inert rather than pretending to be clickable', () => {
    render(<Harness />)

    const total = within(screen.getByTestId('tile-total')).queryByRole('button')
    expect(total).toBeNull()
  })

  it('clears the filter and restores every row', () => {
    render(<Harness />)

    fireEvent.click(negativeTile())
    expect(visibleCount()).toContain('1 dari 3')

    fireEvent.click(screen.getByRole('button', { name: /Hapus filter/ }))
    expect(visibleCount()).toContain('3 dari 3')
  })

  it('filters by topic from the explorer chips', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'kualitas konsumsi' }))

    expect(visibleCount()).toContain('1 dari 3')
    expect(screen.getByText(/Konsumsinya telat/)).toBeTruthy()
  })

  it('replaces rather than intersects when a second metric is clicked', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'jalannya acara' }))
    expect(visibleCount()).toContain('1 dari 3')

    // The negative row is not in "jalannya acara"; if focusOn merged instead of
    // replacing, this would intersect to zero rows.
    fireEvent.click(negativeTile())
    expect(visibleCount()).toContain('1 dari 3')
    expect(screen.getByText(/Konsumsinya telat/)).toBeTruthy()
  })

  it('labels a low-confidence row instead of leaving the number to speak for itself', () => {
    render(<Harness />)

    // r3 sits at 0.40, under the 0.6 threshold; the other two are above it.
    expect(screen.getAllByText('keyakinan rendah')).toHaveLength(1)
  })

  it('states the exact value to assistive technology while the counter animates', () => {
    render(<Harness />)

    // CountUp renders two spans: the animated one, which is aria-hidden because
    // its intermediate frames are wrong numbers, and an sr-only one pinned to the
    // exact value. Both are present, and only one is exposed.
    const shown = within(negativeTile()).getAllByText('33%')
    expect(shown).toHaveLength(2)

    const hidden = shown.filter((node) => node.getAttribute('aria-hidden') === 'true')
    const readable = shown.filter((node) => node.className.includes('sr-only'))
    expect(hidden).toHaveLength(1)
    expect(readable).toHaveLength(1)
  })
})
