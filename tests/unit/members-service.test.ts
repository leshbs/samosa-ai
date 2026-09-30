import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

const from = vi.fn()
const rpc = vi.fn()
const getUserById = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById } } }),
}))
vi.mock('@/modules/auth/services/branding', () => ({
  signBrandingUrls: async () => new Map([['user/u-2/a.png', 'https://signed/a']]),
  purgeOrganizationBranding: vi.fn(),
}))

const { changeMemberRole, listMembers, removeMember, transferOwnership } =
  await import('@/modules/auth/services/members')

const ADMIN = {
  userId: 'u-admin',
  organizationId: 'org-1',
  organizationName: 'OSIS Nusantara',
  role: 'admin' as const,
}
const OWNER = { ...ADMIN, userId: 'u-owner', role: 'owner' as const }
const MEMBER = { ...ADMIN, userId: 'u-member', role: 'member' as const }

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  getUserById.mockReset()
})

describe('listMembers', () => {
  it('puts the owner first and fills in emails, titles and avatars', async () => {
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? fakeQuery({
            data: [
              { user_id: 'u-2', role: 'member', created_at: '2026-09-02' },
              { user_id: 'u-1', role: 'owner', created_at: '2026-09-01' },
            ],
            error: null,
          })
        : fakeQuery({
            data: [
              {
                user_id: 'u-2',
                display_name: 'Budi',
                title: '',
                avatar_path: 'user/u-2/a.png',
              },
              { user_id: 'u-1', display_name: 'Rani', title: 'Ketua', avatar_path: null },
            ],
            error: null,
          }),
    )
    getUserById.mockImplementation(async (id: string) => ({
      data: { user: { email: `${id}@osis.test` } },
    }))

    const result = await listMembers('org-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((member) => member.userId)).toEqual(['u-1', 'u-2'])
    expect(result.value[0]).toMatchObject({ email: 'u-1@osis.test', title: 'Ketua' })
    expect(result.value[1]?.avatarUrl).toBe('https://signed/a')
  })
})

describe('changeMemberRole', () => {
  it('is refused to a plain member before any query runs', async () => {
    const result = await changeMemberRole(MEMBER, 'u-2', 'viewer')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
    expect(from).not.toHaveBeenCalled()
  })

  it('will not change your own role', async () => {
    const result = await changeMemberRole(ADMIN, ADMIN.userId, 'viewer')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
  })

  it('scopes the update to the caller organization', async () => {
    const query = fakeQuery({ data: [{ user_id: 'u-2' }], error: null })
    from.mockReturnValue(query)

    const result = await changeMemberRole(ADMIN, 'u-2', 'viewer')

    expect(result.ok).toBe(true)
    expect(argsOf(query, 'update')).toEqual([{ role: 'viewer' }])
    expect(query.calls).toContainEqual({
      method: 'eq',
      args: ['organization_id', 'org-1'],
    })
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'u-2'] })
  })

  it('reads zero rows as "not allowed or not there" — the owner row, say', async () => {
    from.mockReturnValue(fakeQuery({ data: [], error: null }))

    const result = await changeMemberRole(ADMIN, 'u-owner', 'viewer')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })
})

describe('removeMember', () => {
  it('deletes under RLS and reports success', async () => {
    const query: FakeQuery = fakeQuery({ data: [{ user_id: 'u-2' }], error: null })
    from.mockReturnValue(query)

    const result = await removeMember(OWNER, 'u-2')

    expect(result.ok).toBe(true)
    expect(query.calls.some((call) => call.method === 'delete')).toBe(true)
  })
})

describe('transferOwnership', () => {
  it('is for the owner only', async () => {
    const result = await transferOwnership(ADMIN, 'u-2', 'OSIS Nusantara')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('checks the typed name on the server, not only in the dialog', async () => {
    const result = await transferOwnership(OWNER, 'u-2', 'OSIS Lain')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('hands over through the database function', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const result = await transferOwnership(OWNER, 'u-2', ' osis nusantara ')

    expect(result).toEqual({
      ok: true,
      value: { previousOwnerId: 'u-owner', newOwnerId: 'u-2' },
    })
    expect(rpc).toHaveBeenCalledWith('transfer_organization_ownership', {
      p_organization_id: 'org-1',
      p_new_owner: 'u-2',
    })
  })

  it('turns the function error codes into sentences', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'not_a_member' },
    })

    const result = await transferOwnership(OWNER, 'u-9', 'OSIS Nusantara')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.message).toContain('anggota')
    }
  })
})
