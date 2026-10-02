import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()
const set = vi.fn()
const filters: Record<string, unknown> = {}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return builder
        },
        maybeSingle,
      }
      return builder
    },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set }),
}))

const { ACTIVE_WORKSPACE_COOKIE, pickMembership, setActiveWorkspace } =
  await import('@/modules/auth/services/active-workspace')

const owned = { organizationId: 'org-b', role: 'owner', joinedAt: '2026-06-01' } as const
const joined = { organizationId: 'org-a', role: 'admin', joinedAt: '2026-01-01' } as const
const later = { organizationId: 'org-c', role: 'viewer', joinedAt: '2026-09-01' } as const

beforeEach(() => {
  getUser.mockReset()
  maybeSingle.mockReset()
  set.mockReset()
  for (const key of Object.keys(filters)) delete filters[key]
})

describe('pickMembership', () => {
  it('returns nothing for someone in no workspace', () => {
    expect(pickMembership([], 'org-a')).toBeNull()
  })

  it('honours the preference while the person is still a member', () => {
    expect(pickMembership([owned, joined], 'org-a')).toBe(joined)
  })

  it('falls back to the owned workspace when the preference is gone', () => {
    // Removed from org-a yesterday; the cookie still names it.
    expect(pickMembership([later, owned], 'org-a')).toBe(owned)
    expect(pickMembership([later, owned], null)).toBe(owned)
  })

  it('falls back to the earliest joined when none is owned', () => {
    expect(pickMembership([later, joined], undefined)).toBe(joined)
  })

  it('gives the same answer whatever order the rows arrive in', () => {
    expect(pickMembership([joined, later, owned], null)).toBe(
      pickMembership([owned, later, joined], null),
    )
  })
})

describe('setActiveWorkspace', () => {
  it('stores the choice for a workspace the caller belongs to', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    maybeSingle.mockResolvedValue({ data: { organization_id: 'org-a' }, error: null })

    const result = await setActiveWorkspace('org-a')

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-a' } })
    // Asked about this user and this workspace, not "any membership".
    expect(filters).toEqual({ user_id: 'user-1', organization_id: 'org-a' })
    expect(set).toHaveBeenCalledWith(
      ACTIVE_WORKSPACE_COOKIE,
      'org-a',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
  })

  it('refuses a workspace the caller is not in, and writes no cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await setActiveWorkspace('org-of-someone-else')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
    expect(set).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await setActiveWorkspace('org-a')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
    expect(set).not.toHaveBeenCalled()
  })
})
