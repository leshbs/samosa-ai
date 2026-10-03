// @vitest-environment node
// Node, not jsdom: under jsdom react-pdf takes a browser code path that writes
// an invalid zlib header, so the file starts with %PDF-, opens as blank pages,
// and passes any test that only checks the signature. The real browser path is
// exercised by the e2e spec.
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { ReportPdf, drawableReport } from '@/components/reports/pdf/report-pdf'
import {
  reportPdfPayload,
  type ReportDocumentData,
  type ReportDocumentSection,
} from '@/modules/reporting'

/** The unit test has no server to fetch /fonts from; it reads the same files. */
const FONTS = path.resolve('public/fonts')

/** A4 in points, and the 22mm margin the page number sits inside. */
const PAGE_HEIGHT = 841.89
const MARGIN = 62.36

function term(name: string, count: number) {
  return { term: name, count, share: 0 }
}

const SENTIMENT = {
  total: 128,
  counts: { positive: 61, neutral: 30, negative: 37 },
  shares: { positive: 61 / 128, neutral: 30 / 128, negative: 37 / 128 },
  dominant: 'positive' as const,
}

function section(overrides: Partial<ReportDocumentSection> = {}): ReportDocumentSection {
  return {
    questionText: 'Kritik dan saran',
    mode: 'evaluative',
    answers: 128,
    sentiment: SENTIMENT,
    noContent: 100,
    topics: Array.from({ length: 10 }, (_, i) => term(`topik ${i}`, 40 - i * 3)),
    keywords: Array.from({ length: 12 }, (_, i) => term(`kata ${i}`, 34 - i * 2)),
    topResponsesByTopic: Array.from({ length: 5 }, (_, i) => ({
      topic: `topik ${i}`,
      responses: Array.from({ length: 3 }, () => ({
        text: 'Konsumsinya datang jam dua, padahal acaranya mulai jam sebelas 😭',
        sentiment: 'negative' as const,
      })),
    })),
    ...overrides,
  }
}

function fixture(overrides: Partial<ReportDocumentData> = {}): ReportDocumentData {
  return {
    organizationName: 'OSIS SMA Nusantara',
    datasetName: 'Aspirasi Pensi 2026',
    generatedAt: '3 Okt 2026, 13.10 WIB',
    promptVersion: 'analysis.v2',
    summary: 'Dari 128 aspirasi, 48% bernada positif.\n\nKonsumsi paling dikeluhkan.',
    insights: [
      {
        title: 'Konsumsi jadi keluhan utama',
        detail: 'Perlu vendor cadangan.',
        evidenceResponseIds: ['r1'],
      },
    ],
    answers: 128,
    noContent: 100,
    sections: [section()],
    provenance: {
      modelId: 'gpt-4o-mini',
      promptVersion: 'analysis.v2',
      analyzedAt: '3 Okt 2026, 13.10 WIB',
      analyzed: 128,
      failed: 0,
      runBy: null,
      cost: null,
    },
    ...overrides,
  }
}

async function render(data: ReportDocumentData) {
  const report = await drawableReport(
    reportPdfPayload(data, { r1: 'Konsumsi telat dua jam 🙏' }),
    FONTS,
  )
  const bytes = await renderToBuffer(<ReportPdf report={report} />)
  return { report, bytes, text: bytes.toString('latin1') }
}

/** Every page's drawing commands, inflated. */
function pageStreams(bytes: Buffer, text: string): string[] {
  return [...text.matchAll(/\/Type \/Page\b[^s]*?\/Contents (\d+) 0 R/g)].map(
    ([, contents]) => {
      const at = text.indexOf(`\n${contents} 0 obj`)
      const start = text.indexOf('stream', at) + 6
      const from = bytes[start] === 13 ? start + 2 : start + 1
      return inflateSync(bytes.subarray(from, text.indexOf('endstream', from))).toString(
        'latin1',
      )
    },
  )
}

type Matrix = [number, number, number, number, number, number]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

/**
 * Where each run of text sits, in points down from the top of the page. The
 * text itself cannot be read back — the font is subset and the glyphs are
 * renumbered — but its position can, by following the transform stack.
 */
function textTops(page: string): number[] {
  let current: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  const tops: number[] = []
  for (const line of page.split('\n')) {
    if (line === 'q') stack.push(current)
    else if (line === 'Q') current = stack.pop() ?? current
    else if (line.endsWith(' cm') || line.endsWith(' Tm')) {
      const matrix = line.split(' ').slice(0, 6).map(Number) as Matrix
      if (line.endsWith(' cm')) current = multiply(matrix, current)
      else tops.push(PAGE_HEIGHT - multiply(matrix, current)[5])
    }
  }
  return tops
}

describe('ReportPdf', () => {
  it('renders a readable, multi-page PDF in the app typeface', async () => {
    const { bytes, text } = await render(fixture())

    // %PDF- is the signature every reader checks first; it proves little.
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    // The pages inflate and draw text — a blank-page file fails here.
    const pages = pageStreams(bytes, text)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    for (const page of pages) expect(textTops(page).length).toBeGreaterThan(5)
    // Embedded, so the file looks the same on a machine without the font.
    expect(text).toContain('PlusJakartaSans')
  }, 30_000)

  it('keeps all text on the paper, with a page number at the foot of every page', async () => {
    const { bytes, text } = await render(fixture())

    for (const page of pageStreams(bytes, text)) {
      const tops = textTops(page)
      // Positioned with `bottom`, the page number is drawn thousands of points
      // above the page: present in the file, absent from the paper.
      expect(Math.min(...tops)).toBeGreaterThan(MARGIN)
      expect(Math.max(...tops)).toBeLessThan(PAGE_HEIGHT)
      // The lowest text is in the bottom margin, below where the body may reach.
      expect(Math.max(...tops)).toBeGreaterThan(PAGE_HEIGHT - MARGIN)
    }
  }, 30_000)

  it('leaves out what the typeface cannot draw instead of printing stray symbols', async () => {
    const { report } = await render(fixture())

    expect(report.insights[0]?.quotes).toEqual(['Konsumsi telat dua jam'])
    expect(report.view.sections[0]?.quoted[0]?.responses[0]?.text).toBe(
      'Konsumsinya datang jam dua, padahal acaranya mulai jam sebelas',
    )
    // What the report itself writes — "%", "·", line breaks — is untouched.
    expect(report.summary).toBe(fixture().summary)
    expect(report.view.provenanceFacts).toEqual(
      reportPdfPayload(fixture(), {}).view.provenanceFacts,
    )
  }, 30_000)

  it('renders a report with no summary, no quotes and no provenance', async () => {
    const { bytes } = await render(
      fixture({
        summary: null,
        insights: [],
        noContent: null,
        preferences: {
          includeQuotes: false,
          includeTopicTail: true,
          includeProvenance: false,
        },
        sections: [
          section({
            noContent: null,
            topicTail: Array.from({ length: 23 }, (_, i) =>
              term(`ekor ${i}`, 12 - (i >> 1)),
            ),
          }),
        ],
      }),
    )

    expect(bytes.byteLength).toBeGreaterThan(5_000)
  }, 30_000)

  it('draws a section per question, and more pages for more questions', async () => {
    const one = await render(fixture())
    const three = await render(
      fixture({
        sections: [
          section(),
          section({ questionText: 'Apa yang paling berkesan dari acara ini?' }),
          // Every answer was "tidak ada": the question keeps its place.
          section({
            questionText: 'Ada usul lain?',
            answers: 0,
            sentiment: {
              total: 0,
              counts: { positive: 0, neutral: 0, negative: 0 },
              shares: { positive: 0, neutral: 0, negative: 0 },
              dominant: null,
            },
            noContent: 40,
            topics: [],
            keywords: [],
            topResponsesByTopic: [],
          }),
        ],
      }),
    )

    expect(three.report.view.sections.map((s) => s.title)).toEqual([
      'Kritik dan saran',
      'Apa yang paling berkesan dari acara ini?',
      'Ada usul lain?',
    ])
    const pages = pageStreams(three.bytes, three.text)
    expect(pages.length).toBeGreaterThan(pageStreams(one.bytes, one.text).length)
    // Still on the paper on every page, with three questions laid out.
    for (const page of pages) {
      const tops = textTops(page)
      expect(Math.min(...tops)).toBeGreaterThan(MARGIN)
      expect(Math.max(...tops)).toBeLessThan(PAGE_HEIGHT)
    }
  }, 30_000)
})
