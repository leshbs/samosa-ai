import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

const { getAuthUser, getSessionUser, requireSessionUser } =
  await import('@/modules/auth/services/session')

/** Stands in for the chained `.select().eq().limit().single()` builder. */
function membershipQuery(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        limit: () => ({ single: async () => result }),
      }),
    }),
  }
}

function organizationQuery(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({ single: async () => result }),
    }),
  }
}

const SIGNED_IN = {
  data: { user: { id: 'user-1', email: 'ketua@osis.test' } },
  error: null,
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
})

describe('getAuthUser', () => {
  it('returns the identity without needing an organization', async () => {
    getUser.mockResolvedValue(SIGNED_IN)

    const result = await getAuthUser()

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.userId).toBe('user-1')
    // Signup calls this before any membership row exists.
    expect(from).not.toHaveBeenCalled()
  })

  it('fails as UNAUTHORIZED when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await getAuthUser()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })
})

describe('getSessionUser', () => {
  it('resolves the user together with their organization', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? membershipQuery({
            data: { organization_id: 'org-1', role: 'admin' },
            error: null,
          })
        : organizationQuery({ data: { name: 'OSIS Nusantara' }, error: null }),
    )

    const result = await getSessionUser()

    expect(result).toEqual({
      ok: true,
      value: {
        userId: 'user-1',
        email: 'ketua@osis.test',
        organizationId: 'org-1',
        organizationName: 'OSIS Nusantara',
        role: 'admin',
      },
    })
  })

  it('fails as UNAUTHORIZED when the session is missing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

    const result = await getSessionUser()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })

  it('fails as FORBIDDEN when the account has no membership', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockReturnValue(membershipQuery({ data: null, error: { code: 'PGRST116' } }))

    const result = await getSessionUser()

    expect(result.ok).toBe(false)
    // Signed in but not in any organization is a different fix than signing in.
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
  })

  it('falls back to a placeholder when the organization name cannot be read', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? membershipQuery({
            data: { organization_id: 'org-1', role: 'member' },
            error: null,
          })
        : organizationQuery({ data: null, error: { message: 'gone' } }),
    )

    const result = await getSessionUser()

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.organizationName).toBe('Organisasi')
  })
})

describe('requireSessionUser', () => {
  it('returns the session when one exists', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? membershipQuery({
            data: { organization_id: 'org-1', role: 'owner' },
            error: null,
          })
        : organizationQuery({ data: { name: 'OSIS Nusantara' }, error: null }),
    )

    await expect(requireSessionUser()).resolves.toMatchObject({ role: 'owner' })
  })

  it('throws instead of returning an unauthenticated caller', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requireSessionUser()).rejects.toThrow('You are not signed in')
  })
})
