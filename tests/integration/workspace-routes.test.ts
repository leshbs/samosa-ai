// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createWorkspace = vi.fn()
const leaveWorkspace = vi.fn()
const acceptInvitation = vi.fn()
const completeSignIn = vi.fn()

vi.mock('@/modules/auth', () => ({
  acceptInvitation,
  completeSignIn,
  createWorkspace,
  leaveWorkspace,
}))

const workspaceRoute = await import('@/app/api/workspace/route')
const leaveRoute = await import('@/app/api/workspace/leave/route')
const acceptRoute = await import('@/app/api/invitations/accept/route')
const provisionRoute = await import('@/app/api/auth/provision/route')

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const TOKEN = 'a'.repeat(43)

function post(body: unknown) {
  return new Request('http://localhost:3000/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  createWorkspace
    .mockReset()
    .mockResolvedValue({ ok: true, value: { organizationId: 'o' } })
  leaveWorkspace.mockReset().mockResolvedValue({ ok: true, value: undefined })
  acceptInvitation
    .mockReset()
    .mockResolvedValue({ ok: true, value: { organizationId: 'o' } })
  completeSignIn
    .mockReset()
    .mockResolvedValue({ ok: true, value: { organizationId: null } })
})

describe('POST /api/workspace', () => {
  it('creates under the trimmed name', async () => {
    const response = await workspaceRoute.POST(post({ name: '  OSIS Baru ' }))

    expect(response.status).toBe(201)
    expect(createWorkspace).toHaveBeenCalledWith('OSIS Baru')
  })

  it('rejects a name too short to be one', async () => {
    const response = await workspaceRoute.POST(post({ name: ' a ' }))

    expect(response.status).toBe(422)
    expect(createWorkspace).not.toHaveBeenCalled()
  })

  it('answers a full plan with 409 and the reason', async () => {
    createWorkspace.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'Kamu sudah punya ruang kerja sendiri.' },
    })

    const response = await workspaceRoute.POST(post({ name: 'Kedua' }))

    expect(response.status).toBe(409)
    expect((await response.json()).error.message).toContain('sudah punya')
  })
})

describe('POST /api/workspace/leave', () => {
  it('leaves the workspace that was named', async () => {
    const response = await leaveRoute.POST(post({ organizationId: ORG_ID }))

    expect(response.status).toBe(200)
    expect(leaveWorkspace).toHaveBeenCalledWith(ORG_ID)
  })

  it('rejects anything that is not a workspace id', async () => {
    const response = await leaveRoute.POST(post({ organizationId: 'active' }))

    expect(response.status).toBe(422)
    expect(leaveWorkspace).not.toHaveBeenCalled()
  })

  it('answers an owner with 409', async () => {
    leaveWorkspace.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'Kamu pemiliknya.' },
    })

    const response = await leaveRoute.POST(post({ organizationId: ORG_ID }))

    expect(response.status).toBe(409)
  })
})

describe('POST /api/invitations/accept', () => {
  it('passes on the confirmation to leave, and nothing about which workspace', async () => {
    await acceptRoute.POST(post({ token: TOKEN, leave: true, organizationId: ORG_ID }))

    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN, { leave: true })
  })

  it('does not confirm on the caller behalf', async () => {
    await acceptRoute.POST(post({ token: TOKEN }))

    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN, { leave: undefined })
  })
})

describe('POST /api/auth/provision', () => {
  it('tells the service when the caller is on their way to an invitation', async () => {
    const response = await provisionRoute.POST(post({ joining: true }) as never)

    expect(response.status).toBe(200)
    expect(completeSignIn).toHaveBeenCalledWith({ joining: true })
  })

  it('carries the name typed at signup', async () => {
    await provisionRoute.POST(post({ organizationName: 'OSIS', joining: false }) as never)

    expect(completeSignIn).toHaveBeenCalledWith({
      organizationName: 'OSIS',
      joining: false,
    })
  })

  it('still works with no body at all', async () => {
    const request = new Request('http://localhost:3000/api', { method: 'POST' })

    const response = await provisionRoute.POST(request as never)

    expect(response.status).toBe(200)
    expect(completeSignIn).toHaveBeenCalledWith({})
  })
})
