// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MotionProvider } from '@/components/motion/motion-provider'
import { ExplorerFocusProvider } from '@/components/reports/explorer-focus'
import { QuestionCharts } from '@/components/reports/question-charts'
import {
  ResponseExplorer,
  type ExplorerRow,
} from '@/components/reports/response-explorer'
import { buildDashboardData } from '@/modules/reporting'
import type { QuestionMode, Sentiment } from '@/types/domain'

/**
 * The round's definition of done at the level a reader sees it: a question
 * that has no sentiment in it draws no sentiment chart (pilot 01, §3.1). The
 * bars themselves are Recharts, loaded on demand and not drawn in jsdom; what
 * is asserted here is which charts and tiles a mode asks for at all.
 */

function row(topic: string, sentiment: Sentiment | null = null) {
  return { sentiment, topics: [topic], keywords: sentiment ? ['telat'] : [] }
}

function charts(mode: QuestionMode, rows: ReturnType<typeof row>[]) {
  return render(
    <MotionProvider>
      <ExplorerFocusProvider>
        <QuestionCharts data={buildDashboardData(rows)} mode={mode} />
      </ExplorerFocusProvider>
    </MotionProvider>,
  )
}

describe('QuestionCharts', () => {
  it('draws sentiment for a question that asks for a judgement', () => {
    charts('evaluative', [
      row('konsumsi', 'negative'),
      row('konsumsi', 'negative'),
      row('panitia', 'positive'),
    ])

    expect(screen.getByText('Sebaran sentimen')).toBeTruthy()
    expect(screen.getByText('Total aspirasi')).toBeTruthy()
    // The tile, and the sentiment bar's own legend.
    expect(screen.getAllByText('Positif').length).toBeGreaterThan(0)
  })

  it('draws topics and no sentiment for a reflection', () => {
    charts('thematic', [row('kerja sama tim'), row('kerja sama tim'), row('disiplin')])

    expect(screen.queryByText('Sebaran sentimen')).toBeNull()
    expect(screen.queryByText('Positif')).toBeNull()
    expect(screen.queryByText('Negatif')).toBeNull()
    expect(screen.getByText('Total jawaban')).toBeTruthy()
    expect(screen.getByText('Topik teratas (2 dari 2)')).toBeTruthy()
    expect(screen.getByText('Disebut di 2 jawaban')).toBeTruthy()
  })

  it('counts choices for a question that asks for one', () => {
    charts('categorical', [
      row('outbound'),
      row('outbound'),
      row('outbound'),
      row('pensi'),
    ])

    expect(screen.queryByText('Sebaran sentimen')).toBeNull()
    expect(screen.queryByText(/Kata kunci teratas/)).toBeNull()
    expect(screen.getByText('Pilihan jawaban (2 dari 2)')).toBeTruthy()
    expect(screen.getByText('Paling banyak dipilih')).toBeTruthy()
    // Of answers: three of the four chose it.
    expect(screen.getByText('3 jawaban · 75%')).toBeTruthy()
  })

  it('draws a distribution and a mean for a scale', () => {
    charts('scale', [row('4'), row('4'), row('5'), row('sangat puas')])

    expect(screen.queryByText('Sebaran sentimen')).toBeNull()
    expect(screen.getByText('Sebaran jawaban')).toBeTruthy()
    expect(screen.getByText('Rata-rata')).toBeTruthy()
    expect(screen.getByText('4,33')).toBeTruthy()
    // The worded answer is counted, and said to be outside the mean.
    expect(
      screen.getByText('Dari 3 jawaban berupa angka; 1 lainnya berupa kata.'),
    ).toBeTruthy()
  })

  it('lists the labels a question counts together with another topic', () => {
    const merged = [
      { term: 'kepercayaan diri', from: ['pede', 'percaya diri'] },
      { term: 'disiplin', from: ['kedisiplinan'] },
    ]
    for (const mode of ['evaluative', 'thematic'] as const) {
      const { container, unmount } = render(
        <MotionProvider>
          <ExplorerFocusProvider>
            <QuestionCharts
              data={buildDashboardData([row('kepercayaan diri', 'positive')])}
              mode={mode}
              merged={merged}
            />
          </ExplorerFocusProvider>
        </MotionProvider>,
      )

      // Three labels, counted under two topics; each named beside its topic.
      expect(
        screen.getByText('Lihat 3 label yang dihitung bersama topik lain'),
      ).toBeTruthy()
      expect(container.textContent).toContain(
        'kepercayaan diri mencakup pede, percaya diri',
      )
      expect(container.textContent).toContain('disiplin mencakup kedisiplinan')
      unmount()
    }
  })

  it('says nothing about merging on a report that merged nothing', () => {
    charts('thematic', [row('kerja sama tim'), row('disiplin')])

    expect(screen.queryByText(/dihitung bersama topik lain/)).toBeNull()
    expect(screen.getByText('Dikelompokkan dari isi jawabannya.')).toBeTruthy()
  })

  it('does not offer merged labels for choices or numbers', () => {
    for (const mode of ['categorical', 'scale'] as const) {
      const { unmount } = render(
        <MotionProvider>
          <ExplorerFocusProvider>
            <QuestionCharts
              data={buildDashboardData([row('4')])}
              mode={mode}
              merged={[{ term: '4', from: ['empat'] }]}
            />
          </ExplorerFocusProvider>
        </MotionProvider>,
      )

      expect(screen.queryByText(/dihitung bersama topik lain/)).toBeNull()
      unmount()
    }
  })

  it('reads a report from before modes as it always did', () => {
    render(
      <MotionProvider>
        <ExplorerFocusProvider>
          <QuestionCharts data={buildDashboardData([row('konsumsi', 'negative')])} />
        </ExplorerFocusProvider>
      </MotionProvider>,
    )

    expect(screen.getByText('Sebaran sentimen')).toBeTruthy()
  })
})

describe('ResponseExplorer with answers that have no sentiment', () => {
  const rows: ExplorerRow[] = [
    {
      responseId: 'r1',
      questionId: 'q1',
      responseText: 'Outbond nya seru',
      sentiment: null,
      confidence: null,
      topics: ['outbound'],
      keywords: [],
      summary: null,
    },
    {
      responseId: 'r2',
      questionId: 'q1',
      responseText: 'api unggun',
      sentiment: null,
      confidence: null,
      topics: ['api unggun'],
      keywords: [],
      summary: null,
    },
  ]

  it('offers no sentiment filter and shows no made-up sentiment', () => {
    render(
      <MotionProvider>
        <ResponseExplorer rows={rows} topics={[]} noun="jawaban" />
      </MotionProvider>,
    )

    expect(screen.getByText('Jelajah jawaban')).toBeTruthy()
    expect(screen.getByText('2 dari 2 jawaban')).toBeTruthy()
    // No chips to filter by, and no badge on a row.
    expect(screen.queryByRole('button', { name: 'Netral' })).toBeNull()
    expect(screen.queryByText('Netral')).toBeNull()
    expect(screen.getAllByTitle('Pertanyaan ini tidak dinilai sentimennya')).toHaveLength(
      2,
    )
  })
})
