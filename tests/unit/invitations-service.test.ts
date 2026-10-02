import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

const from = vi.fn()
const rpc = vi.fn()
const getUser = vi.fn()
const getUserById = vi.fn()
const setActiveWorkspace = vi.fn()
const getWorkspaceCapacity = vi.fn()
const env = { NEXT_PUBLIC_EMAIL_LINKS_ENABLED: true }

vi.mock('@/lib/env', () => ({ clientEnv: env }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from, rpc, auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from, auth: { admin: { getUserById } } }),
}))
vi.mock('@/modules/auth/services/branding', () => ({
  signBrandingUrls: async () => new Map(),
}))
vi.mock('@/modules/auth/services/active-workspace', () => ({ setActiveWorkspace }))
vi.mock('@/modules/auth/services/capacity', () => ({
  getWorkspaceCapacity,
  describeFullWorkspace: () => 'Paketmu mencakup 3 orang per ruang kerja.',
}))

const {
  acceptInvitation,
  createInvitation,
  findWorkspaceToLeave,
  getInvitationPreview,
  hashInvitationToken,
  listIncomingInvitations,
} = await import('@/modules/auth/services/invitations')

const ADMIN = {
  userId: 'u-admin',
  organizationId: 'org-1',
  organizationName: 'OSIS Nusantara',
  role: 'admin' as const,
}
const TOKEN = 'a'.repeat(43)

/** What each table answers; a table left out answers with nothing. */
function tables(answers: Record<string, unknown>) {
  from.mockImplementation((table: string) =>
    fakeQuery({ data: answers[table] ?? null, error: null }),
  )
}

function signedInAs(user: Record<string, unknown> | null) {
  getUser.mockResolvedValue({ data: { user }, error: null })
}

const BUDI = { id: 'u-budi', email: 'budi@osis.test' }

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  getUser.mockReset()
  getUserById.mockReset()
  setActiveWorkspace.mockReset()
  getWorkspaceCapacity.mockReset().mockResolvedValue({ hasRoom: true })
  env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = true
  signedInAs(BUDI)
})

describe('createInvitation', () => {
  it('is refused to a role that cannot invite', async () => {
    const result = await createInvitation(
      { ...ADMIN, role: 'member' },
      { email: 'x@osis.test', role: 'member' },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
    expect(from).not.toHaveBeenCalled()
  })

  it('will not invite someone who is already a member', async () => {
    from.mockReturnValue(fakeQuery({ data: [{ user_id: 'u-2' }], error: null }))
    getUserById.mockResolvedValue({ data: { user: { email: 'Budi@OSIS.test' } } })

    const result = await createInvitation(ADMIN, {
      email: 'budi@osis.test',
      role: 'member',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CONFLICT')
  })

  it('replaces an earlier link for the same address and stores only a hash', async () => {
    const members = fakeQuery({ data: [], error: null })
    const revoke = fakeQuery({ data: null, error: null })
    const insert = fakeQuery({
      data: {
        id: 'inv-1',
        email: 'baru@osis.test',
        role: 'viewer',
        created_at: '2026-09-29T00:00:00Z',
        expires_at: '2099-10-06T00:00:00Z',
      },
      error: null,
    })
    const queue: FakeQuery[] = [members, revoke, insert]
    from.mockImplementation(() => queue.shift())

    const result = await createInvitation(ADMIN, {
      email: ' Baru@OSIS.test ',
      role: 'viewer',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.invitation).toMatchObject({ id: 'inv-1', expired: false })

    expect(argsOf(revoke, 'update')?.[0]).toHaveProperty('revoked_at')
    expect(revoke.calls).toContainEqual({
      method: 'eq',
      args: ['email', 'baru@osis.test'],
    })

    const row = argsOf(insert, 'insert')?.[0] as Record<string, unknown>
    expect(row.token_hash).toBe(hashInvitationToken(result.value.token))
    expect(Object.values(row)).not.toContain(result.value.token)
    expect(row).toMatchObject({ invited_by: 'u-admin', organization_id: 'org-1' })
  })
})

describe('createInvitation and the plan', () => {
  const INVITED = {
    data: {
      id: 'inv-1',
      email: 'baru@osis.test',
      role: 'member',
      created_at: '2026-09-29T00:00:00Z',
      expires_at: '2099-10-06T00:00:00Z',
    },
    error: null,
  }
  const OWNER = { ...ADMIN, userId: 'u-owner', role: 'owner' as const }

  /** members, revoke, then whatever the test queues after them. */
  function queue(...rest: FakeQuery[]) {
    const all = [
      fakeQuery({ data: [], error: null }),
      fakeQuery({ data: null, error: null }),
      ...rest,
    ]
    from.mockImplementation(() => all.shift())
  }

  it('refuses the person the plan has no place for, and writes nothing', async () => {
    getWorkspaceCapacity.mockResolvedValue({ hasRoom: false })
    const insert = fakeQuery(INVITED)
    queue(insert)

    const result = await createInvitation(ADMIN, { email: 'x@osis.test', role: 'member' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT')
      expect(result.error.message).toContain('3 orang')
    }
    expect(insert.calls).toEqual([])
    expect(getWorkspaceCapacity).toHaveBeenCalledWith('org-1')
  })

  it('names the organization with the first invitation, when the owner sends it', async () => {
    const rename = fakeQuery({ data: [{ id: 'org-1' }], error: null })
    queue(rename, fakeQuery(INVITED))

    const result = await createInvitation(OWNER, {
      email: 'baru@osis.test',
      role: 'member',
      organizationName: '  OSIS SMA 1 ',
    })

    expect(result.ok && result.value.organizationName).toBe('OSIS SMA 1')
    expect(argsOf(rename, 'update')?.[0]).toEqual({ name: 'OSIS SMA 1' })
    expect(rename.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] })
  })

  it('ignores a name from someone who cannot rename', async () => {
    const insert = fakeQuery(INVITED)
    queue(insert)

    const result = await createInvitation(ADMIN, {
      email: 'baru@osis.test',
      role: 'member',
      organizationName: 'Nama Lain',
    })

    expect(result.ok && result.value.organizationName).toBe('OSIS Nusantara')
    expect(argsOf(insert, 'insert')).toBeDefined()
  })

  it('does not invite under a name that could not be saved', async () => {
    const insert = fakeQuery(INVITED)
    queue(fakeQuery({ data: [], error: null }), insert)

    const result = await createInvitation(OWNER, {
      email: 'baru@osis.test',
      role: 'member',
      organizationName: 'OSIS SMA 1',
    })

    expect(result.ok).toBe(false)
    expect(insert.calls).toEqual([])
  })
})

describe('findWorkspaceToLeave', () => {
  it('is null for someone who follows no organization yet', async () => {
    tables({
      organization_members: [],
      organization_invitations: { organization_id: 'org-new' },
    })

    expect(await findWorkspaceToLeave(TOKEN)).toBeNull()
  })

  it('names the organization already followed', async () => {
    tables({
      organization_members: [{ organization_id: 'org-old', role: 'member' }],
      organization_invitations: { organization_id: 'org-new' },
      organizations: { name: 'MPK Nusantara' },
    })

    expect(await findWorkspaceToLeave(TOKEN)).toEqual({
      organizationId: 'org-old',
      organizationName: 'MPK Nusantara',
    })
  })

  it('never counts a workspace the person owns', async () => {
    const memberships = fakeQuery({ data: [], error: null })
    from.mockImplementation((table: string) =>
      table === 'organization_members'
        ? memberships
        : fakeQuery({ data: { organization_id: 'org-new' }, error: null }),
    )

    await findWorkspaceToLeave(TOKEN)

    // Owned workspaces are filtered out by the query, not after it.
    expect(memberships.calls).toContainEqual({ method: 'neq', args: ['role', 'owner'] })
    expect(memberships.calls).toContainEqual({
      method: 'eq',
      args: ['user_id', 'u-budi'],
    })
  })

  it('does not ask anyone to leave the organization that is inviting them', async () => {
    tables({
      organization_members: [{ organization_id: 'org-new', role: 'viewer' }],
      organization_invitations: { organization_id: 'org-new' },
    })

    expect(await findWorkspaceToLeave(TOKEN)).toBeNull()
  })
})

describe('acceptInvitation', () => {
  const JOINED = {
    data: [{ joined_organization_id: 'org-new', left_organization_id: null }],
    error: null,
  }

  it('sends the hash, never the token, and opens the joined workspace', async () => {
    tables({ organization_members: [] })
    rpc.mockResolvedValue(JOINED)

    const result = await acceptInvitation(TOKEN)

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-new' } })
    expect(rpc).toHaveBeenCalledWith('accept_organization_invitation', {
      p_token_hash: hashInvitationToken(TOKEN),
    })
    expect(setActiveWorkspace).toHaveBeenCalledWith('org-new')
  })

  it('refuses to cost someone an organization they have not agreed to leave', async () => {
    tables({
      organization_members: [{ organization_id: 'org-old', role: 'member' }],
      organization_invitations: { organization_id: 'org-new' },
      organizations: { name: 'MPK Nusantara' },
    })

    const result = await acceptInvitation(TOKEN)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT')
      expect(result.error.message).toContain('MPK Nusantara')
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('leaves the organization the server found, once confirmed', async () => {
    tables({
      organization_members: [{ organization_id: 'org-old', role: 'member' }],
      organization_invitations: { organization_id: 'org-new' },
      organizations: { name: 'MPK Nusantara' },
    })
    rpc.mockResolvedValue({
      data: [{ joined_organization_id: 'org-new', left_organization_id: 'org-old' }],
      error: null,
    })

    const result = await acceptInvitation(TOKEN, { leave: true })

    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('accept_organization_invitation', {
      p_token_hash: hashInvitationToken(TOKEN),
      p_leave_organization_id: 'org-old',
    })
  })

  it('leaves nothing when there was nothing to leave, whatever the browser said', async () => {
    tables({ organization_members: [] })
    rpc.mockResolvedValue(JOINED)

    await acceptInvitation(TOKEN, { leave: true })

    expect(rpc).toHaveBeenCalledWith('accept_organization_invitation', {
      p_token_hash: hashInvitationToken(TOKEN),
    })
  })

  it.each([
    ['invitation_expired', 'CONFLICT', 'kedaluwarsa'],
    ['invitation_email_mismatch', 'FORBIDDEN', 'email lain'],
    ['owner_cannot_leave', 'CONFLICT', 'pemilik'],
    ['invitation_not_found', 'NOT_FOUND', 'tidak ditemukan'],
  ])('explains %s', async (code, errorCode, phrase) => {
    tables({ organization_members: [] })
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: code } })

    const result = await acceptInvitation(TOKEN)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(errorCode)
      expect(result.error.message).toContain(phrase)
    }
    expect(setActiveWorkspace).not.toHaveBeenCalled()
  })
})

describe('listIncomingInvitations', () => {
  const WAITING = {
    organization_invitations: [
      {
        organization_id: 'org-1',
        role: 'member',
        invited_by: 'u-admin',
        expires_at: '2099-01-01T00:00:00Z',
      },
    ],
    organizations: [{ id: 'org-1', name: 'OSIS Nusantara' }],
    profiles: [{ user_id: 'u-admin', display_name: ' Rani ' }],
  }

  it('names who is waiting for a verified address', async () => {
    tables(WAITING)

    expect(await listIncomingInvitations()).toEqual([
      {
        organizationName: 'OSIS Nusantara',
        role: 'member',
        inviterName: 'Rani',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    ])
  })

  it('looks the address up in lower case and skips dead invitations', async () => {
    signedInAs({ id: 'u-budi', email: 'Budi@OSIS.test' })
    const invitations = fakeQuery({ data: [], error: null })
    from.mockReturnValue(invitations)

    await listIncomingInvitations()

    expect(invitations.calls).toContainEqual({
      method: 'eq',
      args: ['email', 'budi@osis.test'],
    })
    expect(invitations.calls).toContainEqual({
      method: 'is',
      args: ['accepted_at', null],
    })
    expect(invitations.calls).toContainEqual({ method: 'is', args: ['revoked_at', null] })
    expect(argsOf(invitations, 'gt')?.[0]).toBe('expires_at')
  })

  it('tells nothing to an address nobody has proven they own', async () => {
    env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = false
    tables(WAITING)

    expect(await listIncomingInvitations()).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('accepts a Google identity for the same address as proof', async () => {
    env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = false
    signedInAs({
      ...BUDI,
      identities: [{ provider: 'google', identity_data: { email: 'Budi@osis.test' } }],
    })
    tables(WAITING)

    expect(await listIncomingInvitations()).toHaveLength(1)
  })

  it('does not accept a Google identity for a different address', async () => {
    env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = false
    signedInAs({
      ...BUDI,
      identities: [{ provider: 'google', identity_data: { email: 'lain@gmail.com' } }],
    })
    tables(WAITING)

    expect(await listIncomingInvitations()).toEqual([])
  })

  it('is empty for a signed-out caller', async () => {
    signedInAs(null)

    expect(await listIncomingInvitations()).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })
})

describe('getInvitationPreview', () => {
  it('says expired rather than pending once the date has passed', async () => {
    from.mockImplementation((table: string) =>
      table === 'organization_invitations'
        ? fakeQuery({
            data: {
              organization_id: 'org-1',
              email: 'budi@osis.test',
              role: 'member',
              invited_by: 'u-admin',
              expires_at: '2000-01-01T00:00:00Z',
              accepted_at: null,
              revoked_at: null,
            },
            error: null,
          })
        : table === 'organizations'
          ? fakeQuery({ data: { name: 'OSIS Nusantara' }, error: null })
          : fakeQuery({ data: { display_name: 'Rani' }, error: null }),
    )

    const preview = await getInvitationPreview(TOKEN)

    expect(preview).toMatchObject({
      status: 'expired',
      organizationName: 'OSIS Nusantara',
      inviterName: 'Rani',
      emailHint: 'b***@osis.test',
    })
  })

  it('is not_found for a token nobody issued', async () => {
    from.mockReturnValue(fakeQuery({ data: null, error: null }))

    expect((await getInvitationPreview(TOKEN)).status).toBe('not_found')
  })
})
