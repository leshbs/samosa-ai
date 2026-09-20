// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '@/modules/shared'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestJson', () => {
  it('unwraps the data envelope on success', async () => {
    stubFetch(async () => jsonResponse({ data: { jobId: 'job-1' } }))

    const result = await requestJson<{ jobId: string }>('/api/analysis')

    expect(result).toEqual({ ok: true, value: { jobId: 'job-1' } })
  })

  it('surfaces the server message and code from an error envelope', async () => {
    stubFetch(async () =>
      jsonResponse({ error: { code: 'VALIDATION', message: 'Dataset kosong' } }, 422),
    )

    const result = await requestJson('/api/analysis')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
    expect(result.error.message).toBe('Dataset kosong')
  })

  it('reports a dropped connection instead of rejecting', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    // The bug this guards: an unhandled rejection here left the calling button
    // disabled forever, with nothing on screen to explain why.
    const result = await requestJson('/api/analysis')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/Koneksi/)
  })

  it('handles a non-JSON body, such as a platform 413 or an HTML 502', async () => {
    stubFetch(
      async () =>
        new Response('<html>Request Entity Too Large</html>', {
          status: 413,
          headers: { 'content-type': 'text/html' },
        }),
    )

    const result = await requestJson('/api/datasets')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/Server tidak merespons/)
  })

  it('falls back when the code is not one we know', async () => {
    stubFetch(async () =>
      jsonResponse({ error: { code: 'TEAPOT', message: 'Aneh' } }, 418),
    )

    const result = await requestJson('/api/datasets')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INTERNAL')
    expect(result.error.message).toBe('Aneh')
  })

  it('refuses a 200 whose body is not our envelope', async () => {
    stubFetch(async () => jsonResponse({ jobId: 'job-1' }))

    const result = await requestJson('/api/analysis')

    expect(result.ok).toBe(false)
  })
})
