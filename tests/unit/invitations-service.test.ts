import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

const from = vi.fn()
const rpc = vi.fn()
const getUserById = vi.fn()
const purgeOrganizationBranding = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from, auth: { admin: { getUserById } } }),
}))
vi.mock('@/modules/auth/services/branding', () => ({
  purgeOrganizationBranding,
  signBrandingUrls: async () => new Map(),
}))

const { acceptInvitation, createInvitation, getInvitationPreview, hashInvitationToken } =
  await import('@/modules/auth/services/invitations')

const ADMIN = {
  userId: 'u-admin',
  organizationId: 'org-1',
  organizationName: 'OSIS Nusantara',
  role: 'admin' as const,
}
const TOKEN = 'a'.repeat(43)

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  getUserById.mockReset()
  purgeOrganizationBranding.mockReset()
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

describe('acceptInvitation', () => {
  it('sends the hash, never the token, to the database function', async () => {
    rpc.mockResolvedValue({
      data: [{ joined_organization_id: 'org-1', dropped_organization_id: null }],
      error: null,
    })

    const result = await acceptInvitation(TOKEN)

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-1' } })
    expect(rpc).toHaveBeenCalledWith('accept_organization_invitation', {
      p_token_hash: hashInvitationToken(TOKEN),
    })
    expect(purgeOrganizationBranding).not.toHaveBeenCalled()
  })

  it('cleans up the empty organization the invitee left behind', async () => {
    rpc.mockResolvedValue({
      data: [{ joined_organization_id: 'org-1', dropped_organization_id: 'org-own' }],
      error: null,
    })

    await acceptInvitation(TOKEN)

    expect(purgeOrganizationBranding).toHaveBeenCalledWith('org-own')
  })

  it.each([
    ['invitation_expired', 'CONFLICT', 'kedaluwarsa'],
    ['invitation_email_mismatch', 'FORBIDDEN', 'email lain'],
    ['membership_conflict', 'CONFLICT', 'organisasi lain'],
    ['invitation_not_found', 'NOT_FOUND', 'tidak ditemukan'],
  ])('explains %s', async (code, errorCode, phrase) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: code } })

    const result = await acceptInvitation(TOKEN)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(errorCode)
      expect(result.error.message).toContain(phrase)
    }
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
