import { beforeEach, describe, expect, it, vi } from 'vitest'

const runJob = vi.fn()
const getJobSnapshot = vi.fn()
const getNotificationTarget = vi.fn()
const sendEmail = vi.fn()
const isEmailConfigured = vi.fn()

vi.mock('@/modules/analysis', () => ({ runJob, getJobSnapshot }))
vi.mock('@/modules/reporting', () => ({ generateReportSummary: vi.fn() }))
vi.mock('@/modules/auth', () => ({ getNotificationTarget }))
vi.mock('@/modules/notifications', async () => {
  const templates = await import('@/modules/notifications/templates/messages')
  return { ...templates, isEmailConfigured, sendEmail }
})

const { runAnalysisJob } = await import('@/app/api/_lib/run-analysis')

const SNAPSHOT = {
  jobId: 'job-1',
  organizationId: 'org-1',
  organizationName: 'OSIS Nusantara',
  organizationTimezone: 'Asia/Makassar',
  datasetId: 'ds-1',
  datasetName: 'Survei Kantin',
  status: 'succeeded',
  processedCount: 154,
  totalCount: 154,
  failedCount: 0,
  noContentCount: 0,
  createdBy: 'u-1',
  finishedAt: '2026-09-29T05:00:00Z',
}

beforeEach(() => {
  for (const mock of [runJob, getJobSnapshot, getNotificationTarget, sendEmail]) {
    mock.mockReset()
  }
  isEmailConfigured.mockReturnValue(true)
  getJobSnapshot.mockResolvedValue(SNAPSHOT)
  getNotificationTarget.mockResolvedValue({
    email: 'rani@osis.test',
    displayName: 'Rani',
    notifyAnalysisFinished: true,
  })
  sendEmail.mockResolvedValue({ ok: true, value: { id: 'em_1' } })
})

describe('runAnalysisJob → email (checklist 5.6)', () => {
  it('emails whoever started the job once it finishes', async () => {
    runJob.mockResolvedValue({ ok: true, value: { analyzed: 154 } })

    await runAnalysisJob('job-1')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [message, kind] = sendEmail.mock.calls[0] as [Record<string, string>, string]
    expect(kind).toBe('analysis_finished')
    expect(message.to).toBe('rani@osis.test')
    expect(message.subject).toBe('Analisis "Survei Kantin" selesai')
    // The organization's zone, not the server's.
    expect(message.text).toMatch(/13[.:]00 WITA/)
    expect(message.text).toContain('/reports/job-1')
  })

  it('emails about a failed job too — that is the one people wait on', async () => {
    runJob.mockResolvedValue({ ok: false, error: { code: 'UPSTREAM', message: 'x' } })
    getJobSnapshot.mockResolvedValue({ ...SNAPSHOT, status: 'failed', processedCount: 0 })

    await runAnalysisJob('job-1')

    const [message] = sendEmail.mock.calls[0] as [Record<string, string>]
    expect(message.text).toContain('/analysis/job-1')
  })

  it('stays quiet when another invocation already ran the job', async () => {
    runJob.mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'x' } })

    await runAnalysisJob('job-1')

    expect(getJobSnapshot).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('respects someone who switched the email off', async () => {
    runJob.mockResolvedValue({ ok: true, value: { analyzed: 154 } })
    getNotificationTarget.mockResolvedValue({
      email: 'rani@osis.test',
      displayName: 'Rani',
      notifyAnalysisFinished: false,
    })

    await runAnalysisJob('job-1')

    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('has nobody to tell about a job from before authors were recorded', async () => {
    runJob.mockResolvedValue({ ok: true, value: { analyzed: 154 } })
    getJobSnapshot.mockResolvedValue({ ...SNAPSHOT, createdBy: null })

    await runAnalysisJob('job-1')

    expect(getNotificationTarget).not.toHaveBeenCalled()
  })

  it('does nothing at all while email is off', async () => {
    runJob.mockResolvedValue({ ok: true, value: { analyzed: 154 } })
    isEmailConfigured.mockReturnValue(false)

    await runAnalysisJob('job-1')

    expect(getJobSnapshot).not.toHaveBeenCalled()
  })
})
