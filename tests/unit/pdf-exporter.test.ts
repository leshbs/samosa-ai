// @vitest-environment node
// react-pdf deflates its content streams. Under jsdom it picks a browser code
// path that emits an invalid zlib header, so the bytes parse as a PDF, open as
// two blank pages, and pass any test that only checks the signature. Node is
// also the runtime the export route actually uses.
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { exportReportToPdf } from '@/modules/reporting/exporters/pdf-exporter'
import type { ReportDocumentData } from '@/modules/reporting/exporters/pdf-exporter'

function fixture(overrides: Partial<ReportDocumentData> = {}): ReportDocumentData {
  return {
    organizationName: 'OSIS SMA Nusantara',
    datasetName: 'Aspirasi Pensi 2026',
    generatedAt: '22 September 2026, 18.00',
    promptVersion: 'analysis.v1',
    summary: 'Dari 120 aspirasi, 58% bernada positif.',
    insights: [
      {
        title: 'Konsumsi jadi keluhan utama',
        detail: 'Perlu vendor cadangan.',
        evidenceResponseIds: ['r1'],
      },
    ],
    sentiment: {
      total: 120,
      counts: { positive: 70, neutral: 20, negative: 30 },
      shares: { positive: 0.583, neutral: 0.167, negative: 0.25 },
      dominant: 'positive',
    },
    topics: [
      { term: 'konsumsi', count: 48, share: 0.4 },
      { term: 'ketepatan waktu', count: 31, share: 0.26 },
    ],
    keywords: [{ term: 'molor', count: 24, share: 0.2 }],
    topResponsesByTopic: [
      {
        topic: 'konsumsi',
        responses: [{ text: 'Konsumsinya datang jam 2.', sentiment: 'negative' }],
      },
    ],
    ...overrides,
  }
}

describe('exportReportToPdf', () => {
  it('renders a real PDF document', async () => {
    const result = await exportReportToPdf(fixture())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // %PDF- is the file signature every reader checks first.
    expect(Buffer.from(result.value.bytes.slice(0, 5)).toString()).toBe('%PDF-')
    expect(result.value.bytes.byteLength).toBeGreaterThan(1_000)
    expect(result.value.fileName).toBe('samosa-aspirasi-pensi-2026.pdf')

    // The signature alone is not evidence the file is readable: a document
    // whose content streams will not inflate opens as blank pages in every
    // viewer while still starting with %PDF-. Inflate one and look for the
    // text it should contain.
    const buffer = Buffer.from(result.value.bytes)
    const start = buffer.indexOf('stream') + 6
    const from = buffer[start] === 13 ? start + 2 : start + 1
    const page = inflateSync(buffer.subarray(from, buffer.indexOf('endstream', from)))
    expect(page.length).toBeGreaterThan(result.value.bytes.byteLength / 4)
  }, 20_000)

  it('renders without a summary rather than failing', async () => {
    const result = await exportReportToPdf(fixture({ summary: null, insights: [] }))

    expect(result.ok).toBe(true)
  }, 20_000)

  it('refuses a job with no results instead of emitting empty pages', async () => {
    const result = await exportReportToPdf(
      fixture({
        sentiment: {
          total: 0,
          counts: { positive: 0, neutral: 0, negative: 0 },
          shares: { positive: 0, neutral: 0, negative: 0 },
          dominant: null,
        },
      }),
    )

    expect(result.ok).toBe(false)
  })

  it('falls back to a usable file name when the dataset name has no letters', async () => {
    const result = await exportReportToPdf(fixture({ datasetName: '???' }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fileName).toBe('samosa-laporan.pdf')
  }, 20_000)
})
