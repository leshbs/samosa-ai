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

/**
 * The words on the page. react-pdf writes the standard fonts' text as hex
 * strings inside TJ arrays of deflated content streams, so a byte search for
 * "Asal data" finds nothing even when it is printed.
 */
function pdfText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes)
  const pages: string[] = []
  for (let from = 0; ;) {
    const start = buffer.indexOf('stream', from)
    if (start < 0) break
    const body = buffer[start + 6] === 13 ? start + 8 : start + 7
    const end = buffer.indexOf('endstream', body)
    try {
      pages.push(inflateSync(buffer.subarray(body, end)).toString('latin1'))
    } catch {
      // Not every stream is deflated content; fonts and images are skipped.
    }
    from = end + 9
  }

  return [...pages.join('\n').matchAll(/\[(.*?)\]\s*TJ/g)]
    .map(([, array]) =>
      [...(array ?? '').matchAll(/<([0-9a-f]+)>/gi)]
        .map(([, hex]) => Buffer.from(hex ?? '', 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n')
}

/** 1×1 transparent PNG: the smallest thing react-pdf will embed. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const PROVENANCE = {
  modelId: 'gpt-4o-mini',
  promptVersion: 'analysis.v1',
  analyzedAt: '22 Sep 2026 18.00 WIB',
  analyzed: 120,
  failed: 3,
  runBy: 'Rani Putri · Sekretaris OSIS',
  cost: 'Rp 42',
}

describe('exportReportToPdf report defaults (checklist 5.5)', () => {
  it('prints the letterhead, the preparer and the provenance by default', async () => {
    const result = await exportReportToPdf(
      fixture({
        preparedBy: { name: 'Rani Putri', title: 'Sekretaris OSIS 2026/2027' },
        provenance: PROVENANCE,
      }),
    )
    if (!result.ok) throw new Error('render failed')
    const text = pdfText(result.value.bytes)

    expect(text).toContain('OSIS SMA Nusantara')
    expect(text).toContain('Disiapkan oleh Rani Putri')
    expect(text).toContain('Sekretaris OSIS 2026/2027')
    expect(text).toContain('Asal data')
    expect(text).toContain('Rani Putri · Sekretaris OSIS')
    expect(text).toContain('Gagal dianalisis')
    // Quotes are on by default; the topic tail is not.
    expect(text).toContain('Contoh aspirasi per topik')
    expect(text).not.toContain('Topik lainnya')
  }, 20_000)

  it('leaves out exactly what the organization switched off', async () => {
    const result = await exportReportToPdf(
      fixture({
        provenance: PROVENANCE,
        topicTail: [{ term: 'parkir', count: 2, share: 0.02 }],
        preferences: {
          includeQuotes: false,
          includeTopicTail: true,
          includeProvenance: false,
        },
      }),
    )
    if (!result.ok) throw new Error('render failed')
    const text = pdfText(result.value.bytes)

    expect(text).not.toContain('Contoh aspirasi per topik')
    expect(text).not.toContain('Asal data')
    expect(text).toContain('Topik lainnya (1)')
    expect(text).toContain('parkir')
  }, 20_000)

  it('embeds the organization logo as an image', async () => {
    const withLogo = await exportReportToPdf(
      fixture({ logo: { data: new Uint8Array(PIXEL_PNG), format: 'png' } }),
    )
    const without = await exportReportToPdf(fixture())
    if (!withLogo.ok || !without.ok) throw new Error('render failed')

    const hasImage = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString('latin1').includes('/Subtype /Image')
    expect(hasImage(withLogo.value.bytes)).toBe(true)
    expect(hasImage(without.value.bytes)).toBe(false)
  }, 20_000)
})
