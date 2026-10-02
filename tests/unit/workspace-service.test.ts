import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

const adminFrom = vi.fn()
const sessionFrom = vi.fn()
const getUser = vi.fn()
const setActiveWorkspace = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: sessionFrom, auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))
vi.mock('@/modules/auth/services/active-workspace', () => ({ setActiveWorkspace }))

const { createWorkspace, provisionOrganization } =
  await import('@/modules/auth/services/provision')
const { leaveWorkspace } = await import('@/modules/auth/services/members')

const ACCOUNT = { id: 'acct-1', plan: 'free', limits: {} }

/**
 * Answers per table, in the order the service asks. The last answer for a
 * table repeats, so a test only spells out what it cares about.
 */
function admin(answers: Record<string, unknown[]>) {
  const made: Record<string, FakeQuery[]> = {}
  adminFrom.mockImplementation((table: string) => {
    const queue = answers[table] ?? [{ data: null, error: null }]
    const seen = (made[table] ??= [])
    const query = fakeQuery(queue[Math.min(seen.length, queue.length - 1)])
    seen.push(query)
    return query
  })
  return made
}

beforeEach(() => {
  adminFrom.mockReset()
  sessionFrom.mockReset()
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
  setActiveWorkspace.mockReset()
})

describe('provisionOrganization', () => {
  it('creates nothing for someone who is already in a workspace', async () => {
    const made = admin({
      organization_members: [{ data: { organization_id: 'org-old' }, error: null }],
    })

    const result = await provisionOrganization({
      userId: 'u-1',
      organizationName: 'OSIS',
    })

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-old' } })
    expect(made.organizations).toBeUndefined()
    expect(made.accounts).toBeUndefined()
  })

  it('puts the new workspace on the account the person already owns', async () => {
    const made = admin({
      organization_members: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      accounts: [{ data: ACCOUNT, error: null }],
      organizations: [{ data: { id: 'org-new' }, error: null }],
    })

    const result = await provisionOrganization({
      userId: 'u-1',
      organizationName: 'OSIS',
    })

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-new' } })
    const organization = made.organizations?.[0] as FakeQuery
    expect(argsOf(organization, 'insert')?.[0]).toMatchObject({
      name: 'OSIS',
      account_id: 'acct-1',
    })
    const membership = made.organization_members?.[1] as FakeQuery
    expect(argsOf(membership, 'insert')?.[0]).toEqual({
      user_id: 'u-1',
      organization_id: 'org-new',
      role: 'owner',
    })
  })

  it('opens an account for a person who has none', async () => {
    const made = admin({
      organization_members: [{ data: null, error: null }],
      accounts: [
        { data: null, error: null },
        { data: ACCOUNT, error: null },
      ],
      organizations: [{ data: { id: 'org-new' }, error: null }],
    })

    const result = await provisionOrganization({
      userId: 'u-1',
      organizationName: 'OSIS',
    })

    expect(result.ok).toBe(true)
    expect(argsOf(made.accounts?.[1] as FakeQuery, 'insert')?.[0]).toEqual({
      owner_id: 'u-1',
    })
  })

  it('creates no workspace without an account to bill it to', async () => {
    const made = admin({
      organization_members: [{ data: null, error: null }],
      accounts: [{ data: null, error: { code: '42P01' } }],
    })

    const result = await provisionOrganization({
      userId: 'u-1',
      organizationName: 'OSIS',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INTERNAL')
    expect(made.organizations).toBeUndefined()
  })

  it('removes the organization again if the membership cannot be written', async () => {
    const made = admin({
      organization_members: [
        { data: null, error: null },
        { data: null, error: { code: '23503' } },
      ],
      accounts: [{ data: ACCOUNT, error: null }],
      organizations: [{ data: { id: 'org-new' }, error: null }],
    })

    const result = await provisionOrganization({
      userId: 'u-1',
      organizationName: 'OSIS',
    })

    expect(result.ok).toBe(false)
    const cleanup = made.organizations?.[1] as FakeQuery
    expect(cleanup.calls).toContainEqual({ method: 'delete', args: [] })
    expect(cleanup.calls).toContainEqual({ method: 'eq', args: ['id', 'org-new'] })
  })
})

describe('createWorkspace', () => {
  function owning(count: number, account: unknown = ACCOUNT) {
    return admin({
      accounts: [{ data: account, error: null }],
      organization_members: [
        { count, error: null },
        { data: null, error: null },
      ],
      organizations: [{ data: { id: 'org-new' }, error: null }],
    })
  }

  it('refuses a signed-out caller before touching anything', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await createWorkspace('OSIS')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('creates the first owned workspace and switches into it', async () => {
    const made = owning(0)

    const result = await createWorkspace('OSIS Baru')

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-new' } })
    expect(setActiveWorkspace).toHaveBeenCalledWith('org-new')
    // Counted for this person and for ownership only: a workspace they merely
    // joined does not use up the one their plan gives them.
    const count = made.organization_members?.[0] as FakeQuery
    expect(count.calls).toContainEqual({ method: 'eq', args: ['user_id', 'u-1'] })
    expect(count.calls).toContainEqual({ method: 'eq', args: ['role', 'owner'] })
  })

  it('stops at one owned workspace on the free plan, and says so', async () => {
    const made = owning(1)

    const result = await createWorkspace('Kedua')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT')
      expect(result.error.message).toContain('sudah punya ruang kerja')
    }
    expect(made.organizations).toBeUndefined()
    expect(setActiveWorkspace).not.toHaveBeenCalled()
  })

  it('allows a second on the organization plan and stops at the third full', async () => {
    owning(2, { ...ACCOUNT, plan: 'org' })
    expect((await createWorkspace('Ketiga')).ok).toBe(true)

    owning(3, { ...ACCOUNT, plan: 'org' })
    const full = await createWorkspace('Keempat')
    expect(full.ok).toBe(false)
    if (!full.ok) expect(full.error.message).toContain('3 ruang kerja')
  })

  it('honours a per-account override of the limit', async () => {
    owning(1, { ...ACCOUNT, limits: { maxWorkspaces: 2 } })

    expect((await createWorkspace('Kedua')).ok).toBe(true)
  })
})

describe('leaveWorkspace', () => {
  function memberWith(role: string | null, deleted: unknown[] = [{ user_id: 'u-1' }]) {
    const lookup = fakeQuery({ data: role ? { role } : null, error: null })
    const removal = fakeQuery({ data: deleted, error: null })
    const queue = [lookup, removal]
    sessionFrom.mockImplementation(() => queue.shift())
    return { lookup, removal }
  }

  it('removes only the caller, and only from the workspace named', async () => {
    const { removal } = memberWith('member')

    const result = await leaveWorkspace('org-2')

    expect(result.ok).toBe(true)
    expect(removal.calls).toContainEqual({ method: 'delete', args: [] })
    expect(removal.calls).toContainEqual({ method: 'eq', args: ['user_id', 'u-1'] })
    expect(removal.calls).toContainEqual({
      method: 'eq',
      args: ['organization_id', 'org-2'],
    })
  })

  it('tells an owner to hand over or delete first', async () => {
    const { removal } = memberWith('owner')

    const result = await leaveWorkspace('org-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT')
      expect(result.error.message).toContain('Serahkan kepemilikan')
    }
    expect(removal.calls).toEqual([])
  })

  it('is not found for a workspace the caller is not in', async () => {
    memberWith(null)

    const result = await leaveWorkspace('org-x')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('reports a failure when the database removed nothing', async () => {
    memberWith('viewer', [])

    const result = await leaveWorkspace('org-2')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INTERNAL')
  })

  it('refuses a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await leaveWorkspace('org-2')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
    expect(sessionFrom).not.toHaveBeenCalled()
  })
})
