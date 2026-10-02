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

/** Every test routes tables through this, so invitations are always answered. */
function route(handler: (table: string) => unknown) {
  from.mockImplementation((table: string) =>
    table === 'organization_invitations' ? invitationsQuery() : handler(table),
  )
}

/**
 * Stands in for `.select().eq()`, which resolves to every membership the user
 * has. One row may be passed bare; null is a query that returned nothing.
 */
function membershipQuery(result: { data: unknown; error: unknown }) {
  const rows =
    result.data === null || Array.isArray(result.data) ? result.data : [result.data]
  return {
    // The same table is asked twice: for the user's memberships, and for a
    // head count of the active workspace. One stub answers both.
    select: () => ({
      eq: async () => ({ data: rows, count: rows?.length ?? null, error: result.error }),
    }),
  }
}

/** Live invitations of the active workspace, as a head count. */
let pendingInvitations: number | null = 0
function invitationsQuery() {
  return {
    select: () => ({
      eq: () => ({
        is: () => ({ is: async () => ({ count: pendingInvitations, error: null }) }),
      }),
    }),
  }
}

/**
 * Serves both the profile (`.eq().maybeSingle()`) and the organizations
 * (`.in('id', ids)`), where the one row answers for the first id asked about.
 */
function organizationQuery(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: async () => result }),
      in: async (_column: string, ids: string[]) => ({
        data: result.data ? [{ id: ids[0], ...(result.data as object) }] : null,
        error: result.error,
      }),
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
  pendingInvitations = 0
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
    route((table: string) =>
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
        workspaces: [{ organizationId: 'org-1', name: 'OSIS Nusantara', role: 'admin' }],
        solo: true,
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
    route((table: string) =>
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
    route((table: string) => {
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
    route((table: string) => {
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
    route(membership)

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

  describe('solo', () => {
    function workspaceOf(members: number) {
      const rows = Array.from({ length: members }, (_, index) => ({
        organization_id: 'org-1',
        role: index === 0 ? 'owner' : 'member',
      }))
      getUser.mockResolvedValue(SIGNED_IN)
      route((table: string) =>
        table === 'organization_members'
          ? {
              select: (_columns: string, options?: { head?: boolean }) => ({
                eq: async () =>
                  options?.head
                    ? { data: null, count: members, error: null }
                    : { data: [rows[0]], error: null },
              }),
            }
          : organizationQuery({ data: { name: 'Ruang kerja rani' }, error: null }),
      )
    }

    it('is true for one person with nobody invited', async () => {
      workspaceOf(1)

      const result = await getSessionUser()

      expect(result.ok && result.value.solo).toBe(true)
    })

    it('ends with the first invitation, before anyone has joined', async () => {
      workspaceOf(1)
      pendingInvitations = 1

      const result = await getSessionUser()

      expect(result.ok && result.value.solo).toBe(false)
    })

    it('is false with a second member', async () => {
      workspaceOf(2)

      const result = await getSessionUser()

      expect(result.ok && result.value.solo).toBe(false)
    })

    it('is false when the count could not be read', async () => {
      workspaceOf(1)
      pendingInvitations = null

      const result = await getSessionUser()

      // Showing "Anggota" to someone alone is harmless; hiding it from a team is not.
      expect(result.ok && result.value.solo).toBe(false)
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

    /** Each organization is named after its id, so a test can tell them apart. */
    function twoWorkspaces() {
      route((table: string) => {
        if (table === 'organization_members') {
          return membershipQuery({ data: TWO, error: null })
        }
        if (table === 'profiles') return organizationQuery({ data: null, error: null })
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map((id) => ({ id, name: id })),
              error: null,
            }),
          }),
        }
      })
    }

    it('opens the owned workspace when the browser has not chosen', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      twoWorkspaces()

      const result = await getSessionUser()

      expect(result.ok && result.value.organizationId).toBe('org-owned')
      expect(result.ok && result.value.role).toBe('owner')
      expect(result.ok && result.value.organizationName).toBe('org-owned')
    })

    it('lists both for the switcher, the owned one first', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      twoWorkspaces()

      const result = await getSessionUser()

      expect(result.ok && result.value.workspaces).toEqual([
        { organizationId: 'org-owned', name: 'org-owned', role: 'owner' },
        { organizationId: 'org-joined', name: 'org-joined', role: 'viewer' },
      ])
    })

    it('opens the chosen workspace, with the role held there', async () => {
      getUser.mockResolvedValue(SIGNED_IN)
      twoWorkspaces()
      activeWorkspace = 'org-joined'

      const result = await getSessionUser()

      expect(result.ok && result.value.organizationId).toBe('org-joined')
      // The role must follow the workspace: owner of one is not owner of both.
      expect(result.ok && result.value.role).toBe('viewer')
      expect(result.ok && result.value.organizationName).toBe('org-joined')
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
    route((table: string) =>
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
    route((table: string) =>
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
