// @vitest-environment node
// Needs the real FormData/File/Response globals that the route handler uses.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as OrgPolicy from '@/modules/auth/policies/org-policy'
import type { ApiFailure, ApiSuccess } from '@/types/api'

const getSessionUser = vi.fn()
const uploadDataset = vi.fn()

vi.mock('@/modules/auth', async () => {
  // `can` is pure policy; exercising the real one keeps the role check honest.
  const actual = await vi.importActual<typeof OrgPolicy>(
    '@/modules/auth/policies/org-policy',
  )
  return { getSessionUser, can: actual.can }
})

vi.mock('@/modules/ingestion', () => ({ uploadDataset }))

const { POST } = await import('@/app/api/datasets/route')

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

function request(fields: Record<string, string | File>): Request {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return new Request('http://localhost/api/datasets', { method: 'POST', body })
}

function csv(): File {
  return new File(['Aspirasi\nKantin kurang bersih'], 'aspirasi.csv', {
    type: 'text/csv',
  })
}

beforeEach(() => {
  getSessionUser.mockReset()
  uploadDataset.mockReset()
})

describe('POST /api/datasets', () => {
  it('stores the dataset and echoes the ingestion summary', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    uploadDataset.mockResolvedValue({
      ok: true,
      value: { datasetId: 'dataset-1', responseCount: 1, skippedEmpty: 0 },
    })

    const file = csv()
    const response = await POST(
      request({
        file,
        name: 'Evaluasi Pensi',
        source: 'csv',
        textColumn: 'Aspirasi',
      }) as never,
    )

    expect(response.status).toBe(201)
    const payload = (await response.json()) as ApiSuccess<{ datasetId: string }>
    expect(payload.data.datasetId).toBe('dataset-1')

    // The tenant comes from the session, never from the request body.
    expect(uploadDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        uploaderId: 'user-1',
        textColumn: 'Aspirasi',
      }),
    )
  })

  it('rejects an anonymous caller before touching the upload service', async () => {
    getSessionUser.mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not signed in' },
    })

    const response = await POST(request({ file: csv() }) as never)

    expect(response.status).toBe(401)
    expect(uploadDataset).not.toHaveBeenCalled()
  })

  it('refuses a viewer, who may read reports but not upload', async () => {
    getSessionUser.mockResolvedValue({
      ok: true,
      value: { ...SESSION.value, role: 'viewer' as const },
    })

    const response = await POST(
      request({ file: csv(), name: 'X', source: 'csv', textColumn: 'Aspirasi' }) as never,
    )

    expect(response.status).toBe(403)
    expect(uploadDataset).not.toHaveBeenCalled()
  })

  it('rejects a request with no file attached', async () => {
    getSessionUser.mockResolvedValue(SESSION)

    const response = await POST(
      request({ name: 'X', source: 'csv', textColumn: 'Aspirasi' }) as never,
    )

    expect(response.status).toBe(422)
    expect(uploadDataset).not.toHaveBeenCalled()
  })

  it('reports which metadata field was invalid', async () => {
    getSessionUser.mockResolvedValue(SESSION)

    const response = await POST(
      request({ file: csv(), name: '', source: 'docx', textColumn: 'Aspirasi' }) as never,
    )

    expect(response.status).toBe(422)
    const payload = (await response.json()) as ApiFailure
    expect(payload.error.details).toMatchObject({
      issues: expect.objectContaining({ name: expect.any(Array) }),
    })
    expect(uploadDataset).not.toHaveBeenCalled()
  })

  it('passes an ingestion failure through with its own status', async () => {
    getSessionUser.mockResolvedValue(SESSION)
    uploadDataset.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'No usable responses found in the file' },
    })

    const response = await POST(
      request({
        file: csv(),
        name: 'Kosong',
        source: 'csv',
        textColumn: 'Aspirasi',
      }) as never,
    )

    expect(response.status).toBe(422)
    const payload = (await response.json()) as ApiFailure
    expect(payload.error.message).toContain('No usable responses')
  })
})
