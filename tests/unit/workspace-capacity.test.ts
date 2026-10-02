import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeQuery, type FakeQuery } from '../stubs/fake-query'

const from = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))

const { describeFullWorkspace, getWorkspaceCapacity } =
  await import('@/modules/auth/services/capacity')

function workspace(input: {
  members: number
  pending: number
  account?: { plan: unknown; limits?: unknown } | null
}) {
  const made: Record<string, FakeQuery> = {}
  const answers: Record<string, unknown> = {
    organization_members: { count: input.members, error: null },
    organization_invitations: { count: input.pending, error: null },
    organizations: { data: { account_id: 'acct-1' }, error: null },
    accounts: {
      data: input.account === undefined ? { plan: 'free', limits: {} } : input.account,
      error: null,
    },
  }
  from.mockImplementation((table: string) => (made[table] = fakeQuery(answers[table])))
  return made
}

beforeEach(() => {
  from.mockReset()
})

describe('getWorkspaceCapacity', () => {
  it('has room for a third person on the free plan', async () => {
    workspace({ members: 2, pending: 0 })

    expect(await getWorkspaceCapacity('org-1')).toEqual({
      plan: 'free',
      members: 2,
      pending: 0,
      maxMembers: 3,
      hasRoom: true,
    })
  })

  it('is full at three, and a pending invitation holds a place', async () => {
    workspace({ members: 3, pending: 0 })
    expect((await getWorkspaceCapacity('org-1')).hasRoom).toBe(false)

    workspace({ members: 2, pending: 1 })
    expect((await getWorkspaceCapacity('org-1')).hasRoom).toBe(false)
  })

  it('counts only invitations that can still be used', async () => {
    const made = workspace({ members: 1, pending: 0 })

    await getWorkspaceCapacity('org-1')

    const pending = made.organization_invitations as FakeQuery
    expect(pending.calls).toContainEqual({ method: 'is', args: ['accepted_at', null] })
    expect(pending.calls).toContainEqual({ method: 'is', args: ['revoked_at', null] })
    expect(pending.calls.some((call) => call.method === 'gt')).toBe(true)
    expect(pending.calls).toContainEqual({
      method: 'eq',
      args: ['organization_id', 'org-1'],
    })
  })

  it('has no limit on the organization plan', async () => {
    workspace({ members: 40, pending: 5, account: { plan: 'org' } })

    const capacity = await getWorkspaceCapacity('org-1')

    expect(capacity.maxMembers).toBeNull()
    expect(capacity.hasRoom).toBe(true)
  })

  it('honours a per-account exception', async () => {
    workspace({
      members: 3,
      pending: 0,
      account: { plan: 'free', limits: { maxMembersPerWorkspace: 5 } },
    })

    const capacity = await getWorkspaceCapacity('org-1')

    expect(capacity.maxMembers).toBe(5)
    expect(capacity.hasRoom).toBe(true)
  })

  it('falls back to the free limits when the account cannot be read', async () => {
    workspace({ members: 3, pending: 0, account: null })

    const capacity = await getWorkspaceCapacity('org-1')

    expect(capacity.plan).toBe('free')
    expect(capacity.hasRoom).toBe(false)
  })
})

describe('describeFullWorkspace', () => {
  const FULL = { plan: 'free' as const, maxMembers: 3, hasRoom: false }

  it('says how many are in and how many the plan covers', () => {
    const sentence = describeFullWorkspace({ ...FULL, members: 3, pending: 0 })

    expect(sentence).toContain('3 orang per ruang kerja')
    expect(sentence).toContain('3 anggota')
    expect(sentence).not.toContain('undangan')
  })

  it('points at pending invitations when they are what is in the way', () => {
    const sentence = describeFullWorkspace({ ...FULL, members: 2, pending: 1 })

    expect(sentence).toContain('1 undangan yang menunggu')
    expect(sentence).toContain('Batalkan undangan')
  })
})
