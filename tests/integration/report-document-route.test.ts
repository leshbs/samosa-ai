// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as OrgPolicy from '@/modules/auth/policies/org-policy'
import type * as ReportData from '@/app/api/_lib/report-data'
import type { ReportPdfPayload } from '@/modules/reporting'
import { ERROR_CODES, appError, err, ok } from '@/modules/shared'
import type { ApiFailure, ApiSuccess } from '@/types/api'

const getSessionUser = vi.fn()
const loadExportContext = vi.fn()
const loadReportExport = vi.fn()

vi.mock('@/modules/auth', async () => {
  const actual = await vi.importActual<typeof OrgPolicy>(
    '@/modules/auth/policies/org-policy',
  )
  return { getSessionUser, can: actual.can }
})

vi.mock('@/app/api/_lib/report-data', async () => {
  // The quotes helper is pure; the two loaders are the database.
  const actual = await vi.importActual<typeof ReportData>('@/app/api/_lib/report-data')
  return { citedQuotes: actual.citedQuotes, loadExportContext, loadReportExport }
})

const { GET } = await import('@/app/api/reports/[id]/document/route')

const SESSION = {
  ok: true,
  value: { userId: 'user-1', organizationId: 'org-1', role: 'viewer' as const },
}

const BUNDLE = {
  archived: true,
  rows: [
    { responseId: 'r1', responseText: 'Konsumsi telat dua jam' },
    { responseId: 'r2', responseText: 'Tidak dikutip' },
  ],
  document: {
    organizationName: 'OSIS SMA 1',
    datasetName: 'Pensi 2026',
    generatedAt: '3 Okt 2026 10.00',
    promptVersion: 'analysis.v2',
    summary: 'Ringkasan.',
    insights: [{ title: 'Konsumsi', detail: 'Telat.', evidenceResponseIds: ['r1'] }],
    sentiment: {
      total: 2,
      counts: { positive: 0, neutral: 1, negative: 1 },
      shares: { positive: 0, neutral: 0.5, negative: 0.5 },
      dominant: null,
    },
    noContent: 3,
    topics: [],
    keywords: [],
    topResponsesByTopic: [],
    logoSrc: 'data:image/png;base64,AAAA',
  },
}

function get(id = 'job-1') {
  return GET(new Request(`http://localhost/api/reports/${id}/document`), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  getSessionUser.mockReset()
  loadExportContext.mockReset().mockResolvedValue({ organizationId: 'org-1' })
  loadReportExport.mockReset()
})

describe('GET /api/reports/[id]/document', () => {
  it('returns the report as the payload the browser draws the PDF from', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    loadReportExport.mockResolvedValue(ok(BUNDLE))

    const response = await get()

    expect(response.status).toBe(200)
    // A report is private and changes when its summary is regenerated.
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { data } = (await response.json()) as ApiSuccess<ReportPdfPayload>
    expect(data.fileName).toBe('samosa-pensi-2026.pdf')
    expect(data.noContent).toBe(3)
    expect(data.logoSrc).toBe('data:image/png;base64,AAAA')
    // Only the response an insight cites travels, not every row.
    expect(data.insights).toEqual([
      { title: 'Konsumsi', detail: 'Telat.', quotes: ['Konsumsi telat dua jam'] },
    ])
    expect(JSON.stringify(data)).not.toContain('Tidak dikutip')
  })

  it('includes archived reports: the download is how one is got out', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    loadReportExport.mockResolvedValue(ok(BUNDLE))

    await get('job-9')

    expect(loadReportExport).toHaveBeenCalledWith('job-9', expect.anything(), {
      includeArchived: true,
    })
  })

  it('refuses a signed-out request before reading anything', async () => {
    getSessionUser.mockResolvedValue(
      err(appError(ERROR_CODES.UNAUTHORIZED, 'Sesi berakhir')),
    )

    const response = await get()

    expect(response.status).toBe(401)
    expect(loadReportExport).not.toHaveBeenCalled()
  })

  it('passes "not found" through for a report in another workspace', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    loadReportExport.mockResolvedValue(
      err(appError(ERROR_CODES.NOT_FOUND, 'Analisis tidak ditemukan')),
    )

    const response = await get()

    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiFailure
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND)
  })
})
