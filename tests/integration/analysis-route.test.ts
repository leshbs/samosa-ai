// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NextServer from 'next/server'
import type * as OrgPolicy from '@/modules/auth/policies/org-policy'
import type { ApiSuccess } from '@/types/api'

const getSessionUser = vi.fn()
const createJob = vi.fn()
const runJob = vi.fn()

/** Captures the callback instead of running it, so the test controls timing. */
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof NextServer>('next/server')
  return {
    ...actual,
    after: (callback: () => Promise<void>) => {
      afterCallbacks.push(callback)
    },
  }
})

vi.mock('@/modules/auth', async () => {
  const actual = await vi.importActual<typeof OrgPolicy>(
    '@/modules/auth/policies/org-policy',
  )
  return { getSessionUser, can: actual.can }
})

vi.mock('@/modules/analysis', () => ({ createJob, runJob }))

const { POST } = await import('@/app/api/analysis/route')

const DATASET_ID = '11111111-1111-4111-8111-111111111111'

const SESSION = {
  ok: true,
  value: {
    userId: 'user-1',
    email: 'ketua@osis.test',
    organizationId: 'org-1',
    organizationName: 'OSIS Nusantara',
    role: 'member' as const,
  },
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/analysis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getSessionUser.mockReset()
  createJob.mockReset()
  runJob.mockReset()
  afterCallbacks.length = 0
})

describe('POST /api/analysis', () => {
  it('returns 202 with the job id before any analysis has run', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    createJob.mockResolvedValue({ ok: true, value: { id: 'job-1', status: 'queued' } })

    const response = await POST(request({ datasetId: DATASET_ID }) as never)

    expect(response.status).toBe(202)
    const payload = (await response.json()) as ApiSuccess<{ jobId: string }>
    expect(payload.data.jobId).toBe('job-1')
    // The whole point of 202: the response does not wait for the model.
    expect(runJob).not.toHaveBeenCalled()
  })

  it('runs the job after the response is sent', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    createJob.mockResolvedValue({ ok: true, value: { id: 'job-1', status: 'queued' } })
    runJob.mockResolvedValue({ ok: true, value: { analyzed: 5 } })

    await POST(request({ datasetId: DATASET_ID }) as never)

    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]?.()
    expect(runJob).toHaveBeenCalledWith('job-1')
  })

  it('swallows a failed run rather than throwing into a sent response', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    createJob.mockResolvedValue({ ok: true, value: { id: 'job-1', status: 'queued' } })
    runJob.mockResolvedValue({
      ok: false,
      error: { code: 'UPSTREAM', message: 'Every analysis batch failed' },
    })

    await POST(request({ datasetId: DATASET_ID }) as never)

    // runJob records failure on the job row; the callback must not reject.
    await expect(afterCallbacks[0]?.()).resolves.toBeUndefined()
  })

  it('passes the tenant from the session, never from the body', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    createJob.mockResolvedValue({ ok: true, value: { id: 'job-1', status: 'queued' } })

    await POST(
      request({ datasetId: DATASET_ID, organizationId: 'org-attacker' }) as never,
    )

    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', datasetId: DATASET_ID }),
    )
  })

  it('rejects an anonymous caller', async () => {
    getSessionUser.mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not signed in' },
    })

    const response = await POST(request({ datasetId: DATASET_ID }) as never)

    expect(response.status).toBe(401)
    expect(createJob).not.toHaveBeenCalled()
  })

  it('refuses a viewer, who cannot spend the organization budget', async () => {
    getSessionUser.mockResolvedValue({
      ok: true,
      value: { ...SESSION.value, role: 'viewer' as const },
    })

    const response = await POST(request({ datasetId: DATASET_ID }) as never)

    expect(response.status).toBe(403)
    expect(createJob).not.toHaveBeenCalled()
  })

  it('rejects a dataset id that is not a UUID', async () => {
    getSessionUser.mockResolvedValue(SESSION)

    const response = await POST(request({ datasetId: 'not-a-uuid' }) as never)

    expect(response.status).toBe(422)
    expect(createJob).not.toHaveBeenCalled()
  })

  it('rejects a malformed body instead of throwing a 500', async () => {
    getSessionUser.mockResolvedValue(SESSION)

    const response = await POST(
      new Request('http://localhost/api/analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      }) as never,
    )

    expect(response.status).toBe(422)
  })

  it('does not schedule any work when the job could not be created', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    createJob.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'Dataset has no responses to analyze' },
    })

    const response = await POST(request({ datasetId: DATASET_ID }) as never)

    expect(response.status).toBe(422)
    expect(afterCallbacks).toHaveLength(0)
  })
})
