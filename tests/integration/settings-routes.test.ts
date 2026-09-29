// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as OrgPolicy from '@/modules/auth/policies/org-policy'

const getSessionUser = vi.fn()
const updateOrganization = vi.fn()
const deleteOrganization = vi.fn()
const createInvitation = vi.fn()
const acceptInvitation = vi.fn()
const changeMemberRole = vi.fn()
const transferOwnership = vi.fn()
const getNotificationTarget = vi.fn()
const purgeOrganizationFiles = vi.fn()
const enforceRateLimit = vi.fn()
const buildOrganizationArchive = vi.fn()

vi.mock('@/modules/auth', async () => {
  const policy = await vi.importActual<typeof OrgPolicy>(
    '@/modules/auth/policies/org-policy',
  )
  return {
    can: policy.can,
    getSessionUser,
    updateOrganization,
    deleteOrganization,
    createInvitation,
    acceptInvitation,
    changeMemberRole,
    removeMember: vi.fn(),
    transferOwnership,
    getNotificationTarget,
  }
})
vi.mock('@/modules/ingestion', () => ({ purgeOrganizationFiles }))
vi.mock('@/modules/security', () => ({ enforceRateLimit }))
vi.mock('@/modules/analysis', () => ({ getJobSnapshot: vi.fn() }))
vi.mock('@/app/api/_lib/organization-archive', () => ({ buildOrganizationArchive }))

const organizationRoute = await import('@/app/api/settings/organization/route')
const invitationsRoute = await import('@/app/api/settings/invitations/route')
const acceptRoute = await import('@/app/api/invitations/accept/route')
const memberRoute = await import('@/app/api/settings/members/[userId]/route')
const transferRoute = await import('@/app/api/settings/organization/transfer/route')
const exportRoute = await import('@/app/api/settings/organization/export/route')

const USER_ID = '22222222-2222-4222-8222-222222222222'

function session(role: 'owner' | 'admin' | 'member' | 'viewer') {
  return {
    ok: true,
    value: {
      userId: 'u-1',
      email: 'ketua@osis.test',
      displayName: 'Rani',
      title: '',
      avatarPath: null,
      organizationId: 'org-1',
      organizationName: 'OSIS Nusantara',
      organizationTimezone: 'Asia/Jakarta',
      role,
      hasPassword: true,
    },
  }
}

function json(method: string, body: unknown): Request {
  return new Request('http://localhost/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = (userId: string) => ({ params: Promise.resolve({ userId }) })

beforeEach(() => {
  vi.clearAllMocks()
  enforceRateLimit.mockResolvedValue({ ok: true, value: { remaining: 5 } })
})

describe('PATCH /api/settings/organization', () => {
  it('is owner-only, before the body is even read', async () => {
    getSessionUser.mockResolvedValue(session('admin'))

    const response = await organizationRoute.PATCH(json('PATCH', { name: 'Baru' }))

    expect(response.status).toBe(403)
    expect(updateOrganization).not.toHaveBeenCalled()
  })

  it('rejects an empty change', async () => {
    getSessionUser.mockResolvedValue(session('owner'))

    const response = await organizationRoute.PATCH(json('PATCH', {}))

    expect(response.status).toBe(422)
  })

  it('updates the session organization, never one named in the body', async () => {
    getSessionUser.mockResolvedValue(session('owner'))
    updateOrganization.mockResolvedValue({ ok: true, value: {} })

    await organizationRoute.PATCH(
      json('PATCH', { timezone: 'Asia/Jayapura', organizationId: 'org-attacker' }),
    )

    expect(updateOrganization).toHaveBeenCalledWith('org-1', {
      timezone: 'Asia/Jayapura',
    })
  })
})

describe('DELETE /api/settings/organization', () => {
  it('purges uploads only after the rows are gone', async () => {
    getSessionUser.mockResolvedValue(session('owner'))
    deleteOrganization.mockResolvedValue({ ok: true, value: undefined })

    const response = await organizationRoute.DELETE(
      json('DELETE', { confirmation: 'OSIS Nusantara' }),
    )

    expect(response.status).toBe(200)
    expect(purgeOrganizationFiles).toHaveBeenCalledWith('org-1')
  })

  it('leaves the files when the delete was refused', async () => {
    getSessionUser.mockResolvedValue(session('owner'))
    deleteOrganization.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'Nama tidak sama' },
    })

    const response = await organizationRoute.DELETE(json('DELETE', { confirmation: 'x' }))

    expect(response.status).toBe(422)
    expect(purgeOrganizationFiles).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/invitations', () => {
  it('returns the link once, and says email is off when it is', async () => {
    getSessionUser.mockResolvedValue(session('admin'))
    createInvitation.mockResolvedValue({
      ok: true,
      value: {
        token: 'tok_123456789012345678901234',
        invitation: {
          id: 'inv-1',
          email: 'budi@osis.test',
          role: 'member',
          createdAt: '2026-09-29T00:00:00Z',
          expiresAt: '2026-10-06T00:00:00Z',
          expired: false,
        },
      },
    })

    const response = await invitationsRoute.POST(
      json('POST', { email: 'Budi@OSIS.test', role: 'member' }),
    )
    const body = (await response.json()) as { data: { url: string; email: string } }

    expect(response.status).toBe(201)
    expect(body.data.url).toMatch(/\/invite\/tok_123456789012345678901234$/)
    expect(body.data.email).toBe('off')
    expect(createInvitation).toHaveBeenCalledWith(expect.anything(), {
      email: 'budi@osis.test',
      role: 'member',
    })
  })

  it('never lets an invitation make someone owner', async () => {
    getSessionUser.mockResolvedValue(session('owner'))

    const response = await invitationsRoute.POST(
      json('POST', { email: 'budi@osis.test', role: 'owner' }),
    )

    expect(response.status).toBe(422)
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('stops at the rate limit before creating anything', async () => {
    getSessionUser.mockResolvedValue(session('admin'))
    enforceRateLimit.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan.' },
    })

    const response = await invitationsRoute.POST(
      json('POST', { email: 'budi@osis.test', role: 'member' }),
    )

    expect(response.status).toBe(429)
    expect(createInvitation).not.toHaveBeenCalled()
  })
})

describe('POST /api/invitations/accept', () => {
  it('rejects a malformed token without asking the database', async () => {
    const response = await acceptRoute.POST(json('POST', { token: '../../etc' }))

    expect(response.status).toBe(422)
    expect(acceptInvitation).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/settings/members/[userId]', () => {
  it('rejects an id that is not a uuid', async () => {
    getSessionUser.mockResolvedValue(session('owner'))

    const response = await memberRoute.PATCH(
      json('PATCH', { role: 'viewer' }),
      params('x'),
    )

    expect(response.status).toBe(422)
    expect(changeMemberRole).not.toHaveBeenCalled()
  })

  it('passes the session as the actor', async () => {
    getSessionUser.mockResolvedValue(session('admin'))
    changeMemberRole.mockResolvedValue({ ok: true, value: {} })

    await memberRoute.PATCH(json('PATCH', { role: 'viewer' }), params(USER_ID))

    expect(changeMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', role: 'admin' }),
      USER_ID,
      'viewer',
    )
  })
})

describe('POST /api/settings/organization/transfer', () => {
  it('reports that email is off rather than claiming it was sent', async () => {
    getSessionUser.mockResolvedValue(session('owner'))
    transferOwnership.mockResolvedValue({
      ok: true,
      value: { previousOwnerId: 'u-1', newOwnerId: USER_ID },
    })

    const response = await transferRoute.POST(
      json('POST', { newOwnerId: USER_ID, confirmation: 'OSIS Nusantara' }),
    )
    const body = (await response.json()) as { data: { email: string } }

    expect(response.status).toBe(200)
    expect(body.data.email).toBe('off')
  })
})

describe('GET /api/settings/organization/export', () => {
  it('is for owners and admins only', async () => {
    getSessionUser.mockResolvedValue(session('member'))

    const response = await exportRoute.GET(new Request('http://localhost/x'))

    expect(response.status).toBe(403)
    expect(buildOrganizationArchive).not.toHaveBeenCalled()
  })

  it('sends a zip with a download name', async () => {
    getSessionUser.mockResolvedValue(session('admin'))
    buildOrganizationArchive.mockResolvedValue({
      ok: true,
      value: {
        bytes: new Uint8Array([80, 75, 5, 6]),
        fileName: 'samosa-osis.zip',
        skipped: 0,
      },
    })

    const response = await exportRoute.GET(new Request('http://localhost/x'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toContain('samosa-osis.zip')
  })
})
