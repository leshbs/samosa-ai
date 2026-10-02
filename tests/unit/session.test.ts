import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

/** The active-workspace cookie; null is a browser that has never chosen. */
let activeWorkspace: string | null = null

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (activeWorkspace ? { value: activeWorkspace } : undefined),
  }),
}))

const { getAuthUser, getSessionUser, requireSessionUser } =
  await import('@/modules/auth/services/session')

/**
 * Stands in for `.select().eq()`, which resolves to every membership the user
 * has. One row may be passed bare; null is a query that returned nothing.
 */
function membershipQuery(result: { data: unknown; error: unknown }) {
  const rows =
    result.data === null || Array.isArray(result.data) ? result.data : [result.data]
  return {
    select: () => ({ eq: async () => ({ data: rows, error: result.error }) }),
  }
}

/** Serves both the organization (`single`) and the profile (`maybeSingle`). */
function organizationQuery(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({ single: async () => result, maybeSingle: async () => result }),
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
  activeWorkspace = null
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
        displayName: '',
        title: '',
        avatarPath: null,
        organizationId: 'org-1',
        organizationName: 'OSIS Nusantara',
        organizationTimezone: 'Asia/Jakarta',
        role: 'admin',
        hasPassword: false,
      },
    })
  })

  it('carries the display name from auth metadata when one is set', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'ketua@osis.test',
          user_metadata: { full_name: 'Rani Putri' },
        },
      },
      error: null,
    })
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? membershipQuery({
            data: { organization_id: 'org-1', role: 'admin' },
            error: null,
          })
        : organizationQuery({ data: { name: 'OSIS Nusantara' }, error: null }),
    )

    const result = await getSessionUser()

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.displayName).toBe('Rani Putri')
  })

  it('prefers the profile name and carries title and timezone', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'ketua@osis.test',
          user_metadata: { full_name: 'Nama Lama' },
        },
      },
      error: null,
    })
    from.mockImplementation((table: string) => {
      if (table === 'organization_members') {
        return membershipQuery({
          data: { organization_id: 'org-1', role: 'owner' },
          error: null,
        })
      }
      if (table === 'profiles') {
        return organizationQuery({
          data: {
            display_name: 'Rani Putri',
            title: 'Sekretaris OSIS 2026/2027',
            avatar_path: 'user/user-1/avatar.png',
          },
          error: null,
        })
      }
      return organizationQuery({
        data: { name: 'OSIS Nusantara', timezone: 'Asia/Makassar' },
        error: null,
      })
    })

    const result = await getSessionUser()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.displayName).toBe('Rani Putri')
    expect(result.value.title).toBe('Sekretaris OSIS 2026/2027')
    expect(result.value.avatarPath).toBe('user/user-1/avatar.png')
    expect(result.value.organizationTimezone).toBe('Asia/Makassar')
  })

  it('survives a database that has not had the settings migration yet', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockImplementation((table: string) => {
      if (table === 'organization_members') {
        return membershipQuery({
          data: { organization_id: 'org-1', role: 'owner' },
          error: null,
        })
      }
      if (table === 'profiles') {
        return organizationQuery({
          data: null,
          error: { code: '42P01', message: 'relation "profiles" does not exist' },
        })
      }
      // No timezone column: the row simply lacks the key.
      return organizationQuery({ data: { name: 'OSIS Nusantara' }, error: null })
    })

    const result = await getSessionUser()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.organizationTimezone).toBe('Asia/Jakarta')
    expect(result.value.title).toBe('')
  })

  it('knows whether the account has a password to change', async () => {
    const membership = (table: string) =>
      table === 'organization_members'
        ? membershipQuery({
            data: { organization_id: 'org-1', role: 'owner' },
            error: null,
          })
        : organizationQuery({ data: { name: 'OSIS Nusantara' }, error: null })
    from.mockImplementation(membership)

    const withProviders = (providers: unknown) => ({
      data: {
        user: { id: 'user-1', email: 'ketua@osis.test', app_metadata: { providers } },
      },
      error: null,
    })

    getUser.mockResolvedValue(withProviders(['google']))
    const googleOnly = await getSessionUser()
    getUser.mockResolvedValue(withProviders(['google', 'email']))
    const linked = await getSessionUser()
    getUser.mockResolvedValue(SIGNED_IN)
    const unknown = await getSessionUser()

    expect(googleOnly.ok && googleOnly.value.hasPassword).toBe(false)
    expect(linked.ok && linked.value.hasPassword).toBe(true)
    expect(unknown.ok && unknown.value.hasPassword).toBe(false)
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

  it('fails as FORBIDDEN when the membership list is simply empty', async () => {
    getUser.mockResolvedValue(SIGNED_IN)
    from.mockReturnValue(membershipQuery({ data: [], error: null }))

    const result = await getSessionUser()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
  })

  describe('with two workspaces', () => {
    const TWO = [
      { organization_id: 'org-joined', role: 'viewer', created_at: '2026-01-01' },
      { organization_id: 'org-owned', role: 'owner', created_at: '2026-06-01' },
    ]

    /** Records which organization the session went on to read. */
    function twoWorkspaces() {
      const read: string[] = []
      from.mockImplementation((table: string) => {
        if (table === 'organization_members') {
          return membershipQuery({ data: TWO, error: null })
        }
        if (table === 'profiles') return organizationQuery({ data: null, error: null })
        return {
          select: () => ({
            eq: (_column: string, id: string) => {
              read.push(id)
              return { single: async () => ({ data: { name: id }, error: null }) }
            },
          }),
        }
      })
      return read
    }

    it('opens the owned workspace when the browser has not chosen', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      const read = twoWorkspaces()

      const result = await getSessionUser()

      expect(result.ok && result.value.organizationId).toBe('org-owned')
      expect(result.ok && result.value.role).toBe('owner')
      expect(read).toEqual(['org-owned'])
    })

    it('opens the chosen workspace, with the role held there', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      const read = twoWorkspaces()
      activeWorkspace = 'org-joined'

      const result = await getSessionUser()

      expect(result.ok && result.value.organizationId).toBe('org-joined')
      // The role must follow the workspace: owner of one is not owner of both.
      expect(result.ok && result.value.role).toBe('viewer')
      expect(read).toEqual(['org-joined'])
    })

    it('ignores a cookie naming a workspace the user is not in', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      twoWorkspaces()
      activeWorkspace = 'org-of-someone-else'

      const result = await getSessionUser()

      expect(result.ok && result.value.organizationId).toBe('org-owned')
    })
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

    await expect(requireSessionUser()).rejects.toThrow('Kamu belum masuk')
  })
})
