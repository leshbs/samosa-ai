// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MotionProvider } from '@/components/motion/motion-provider'
import { InsightCards, VISIBLE_INSIGHTS } from '@/components/reports/insight-cards'
import type { ReportInsight } from '@/types/domain'

function cards(insights: ReportInsight[]) {
  return render(
    <MotionProvider>
      <InsightCards insights={insights} quotes={{ r1: 'Mic mati', r2: 'Suara pecah' }} />
    </MotionProvider>,
  )
}

const counted = (count: number): ReportInsight[] =>
  Array.from({ length: count }, (_, index) => ({
    title: `Temuan ${index + 1}`,
    detail: 'detail',
    evidenceResponseIds: ['r1', 'r2'],
    support: 30 - index,
    topics: ['kantin'],
    signal: 'topic',
  }))

describe('InsightCards', () => {
  it('shows the first five and offers the rest, as many as the data made', () => {
    cards(counted(7))

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(VISIBLE_INSIGHTS)
    fireEvent.click(screen.getByRole('button', { name: 'Lihat semua (7)' }))

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
    expect(
      screen
        .getByRole('button', { name: 'Tampilkan 5 teratas' })
        .getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('offers nothing more when there is nothing more', () => {
    cards(counted(VISIBLE_INSIGHTS))

    expect(screen.queryByRole('button', { name: /Lihat semua/ })).toBeNull()
  })

  it('says what a finding stands on: its count, its signal, the labels it covers', () => {
    cards([
      {
        title: 'Tata suara',
        detail: 'detail',
        evidenceResponseIds: ['r1', 'r2'],
        support: 11,
        topics: ['kualitas audio', 'kualitas mic'],
        signal: 'negative',
      },
    ])

    expect(screen.getByText('Disebut di 11 jawaban')).toBeTruthy()
    expect(screen.getByText('Hampir semua negatif')).toBeTruthy()
    expect(screen.getByText('mencakup kualitas audio, kualitas mic')).toBeTruthy()
    expect(screen.getByText(/disebut cukup banyak jawaban/)).toBeTruthy()
  })

  it('describes a summary from before C.4 as it always did', () => {
    cards([{ title: 'Lama', detail: 'detail', evidenceResponseIds: [] }])

    expect(screen.getByText(/Disusun AI dari angka agregat/)).toBeTruthy()
    expect(screen.queryByText(/Disebut di/)).toBeNull()
  })
})
