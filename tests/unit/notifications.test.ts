// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analysisFinishedEmail,
  invitationEmail,
  ownershipTransferredEmail,
} from '@/modules/notifications/templates/messages'

const BASE = {
  recipientName: 'Rani',
  organizationName: 'OSIS Nusantara',
  datasetName: 'Survei Kantin',
  analyzed: 150,
  total: 154,
  failed: 4,
  finishedAt: '29 Sep 2026 14.30 WIB',
  url: 'https://samosa.test/reports/job-1',
}

describe('analysisFinishedEmail (checklist 5.6)', () => {
  it('carries the dataset, the count, the status and one button to the report', () => {
    const email = analysisFinishedEmail({ ...BASE, status: 'partial' })

    expect(email.subject).toBe('Analisis "Survei Kantin" selesai sebagian')
    expect(email.text).toContain('150 dari 154')
    expect(email.text).toContain('Buka laporan: https://samosa.test/reports/job-1')
    // One button: exactly one link in the HTML.
    expect(email.html.match(/<a /g)).toHaveLength(1)
  })

  it('points a failed job at its detail page, not a report that does not exist', () => {
    const email = analysisFinishedEmail({
      ...BASE,
      status: 'failed',
      url: 'https://samosa.test/analysis/job-1',
    })

    expect(email.subject).toContain('gagal')
    expect(email.text).toContain(
      'Lihat detail analisis: https://samosa.test/analysis/job-1',
    )
  })

  it('escapes names so a dataset called <script> stays text', () => {
    const email = analysisFinishedEmail({
      ...BASE,
      status: 'succeeded',
      datasetName: '<script>alert(1)</script>',
    })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

describe('invitationEmail', () => {
  it('names the inviter, the role in plain words, and the expiry', () => {
    const email = invitationEmail({
      organizationName: 'OSIS Nusantara',
      inviterName: 'Rani',
      roleLabel: 'Anggota',
      roleDescription: 'Mengunggah data, menjalankan analisis, dan mengekspor laporan.',
      url: 'https://samosa.test/invite/abc',
      expiresAt: '6 Okt 2026 14.30 WIB',
    })

    expect(email.text).toContain('Rani mengundangmu')
    expect(email.text).toContain('sebagai Anggota')
    expect(email.text).not.toMatch(/\b(member|viewer|owner)\b/)
    expect(email.text).toContain('6 Okt 2026 14.30 WIB')
  })
})

describe('ownershipTransferredEmail (checklist 5.2)', () => {
  const shared = {
    organizationName: 'OSIS Nusantara',
    previousOwnerName: 'Rani',
    newOwnerName: 'Budi',
    url: 'https://samosa.test/settings',
  }

  it('tells the new owner what they now hold', () => {
    const email = ownershipTransferredEmail({ ...shared, audience: 'new' })
    expect(email.text).toContain('Rani menyerahkan kepemilikan OSIS Nusantara kepadamu')
  })

  it('doubles as an alarm for the old owner', () => {
    const email = ownershipTransferredEmail({ ...shared, audience: 'previous' })
    expect(email.text).toContain('diserahkan kepada Budi')
    expect(email.text).toContain('Kalau bukan kamu yang melakukan ini')
  })
})

describe('sendEmail', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function load() {
    return import('@/modules/notifications/services/email')
  }

  const message = { to: 'rani@osis.test', subject: 's', html: '<p>h</p>', text: 't' }

  it('sends nothing and says so when email is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')
    const { isEmailConfigured, sendEmail } = await load()

    expect(isEmailConfigured()).toBe(false)
    const result = await sendEmail(message, 'test')
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to Resend with the key as a bearer token', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    vi.stubEnv('EMAIL_FROM', 'SAMOSA <noreply@samosa.test>')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }),
    )
    const { sendEmail } = await load()

    const result = await sendEmail(message, 'test')

    expect(result).toEqual({ ok: true, value: { id: 'em_1' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer re_test_123',
    )
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'SAMOSA <noreply@samosa.test>',
      to: ['rani@osis.test'],
    })
  })

  it('reports a rejected send without throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    vi.stubEnv('EMAIL_FROM', 'SAMOSA <noreply@samosa.test>')
    fetchMock.mockResolvedValue(new Response('{}', { status: 422 }))
    const { sendEmail } = await load()

    const result = await sendEmail(message, 'test')
    expect(result.ok).toBe(false)
  })
})
