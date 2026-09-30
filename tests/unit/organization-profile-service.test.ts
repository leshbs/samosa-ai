// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

const from = vi.fn()
const getUser = vi.fn()
const purgeOrganizationBranding = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from, auth: { getUser } }),
}))
vi.mock('@/modules/auth/services/branding', () => ({
  purgeOrganizationBranding,
  signBrandingUrl: async (path: string | null) =>
    path ? `https://signed/${path}` : null,
}))

const { deleteOrganization, getOrganizationSettings, updateOrganization } =
  await import('@/modules/auth/services/organization')
const { updateProfile } = await import('@/modules/auth/services/profile')

const OWNER = {
  organizationId: 'org-1',
  organizationName: 'OSIS Nusantara',
  role: 'owner' as const,
}

beforeEach(() => {
  from.mockReset()
  getUser.mockReset()
  purgeOrganizationBranding.mockReset()
})

describe('getOrganizationSettings', () => {
  it('falls back to defaults for columns a pending migration has not added', async () => {
    from.mockReturnValue(
      fakeQuery({
        data: { id: 'org-1', name: 'OSIS', slug: 'osis', created_at: '2026-09-01' },
        error: null,
      }),
    )

    const result = await getOrganizationSettings('org-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.timezone).toBe('Asia/Jakarta')
    expect(result.value.reportPreferences).toEqual({
      includeQuotes: true,
      includeTopicTail: false,
      includeProvenance: true,
    })
    expect(result.value.logoUrl).toBeNull()
  })
})

describe('updateOrganization', () => {
  it('writes only the keys that were sent', async () => {
    const query = fakeQuery({
      data: { id: 'org-1', name: 'OSIS', report_include_quotes: false },
      error: null,
    })
    from.mockReturnValue(query)

    const result = await updateOrganization('org-1', { reportIncludeQuotes: false })

    expect(result.ok).toBe(true)
    // Toggling one switch must never overwrite another with a stale value.
    expect(argsOf(query, 'update')).toEqual([{ report_include_quotes: false }])
    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] })
  })

  it('reads "no row came back" as RLS refusing a non-owner', async () => {
    from.mockReturnValue(fakeQuery({ data: null, error: null }))

    const result = await updateOrganization('org-1', { name: 'Baru' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
  })
})

describe('deleteOrganization', () => {
  it('refuses anyone but the owner without touching the database', async () => {
    const result = await deleteOrganization({ ...OWNER, role: 'admin' }, 'OSIS Nusantara')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses a name that does not match', async () => {
    const result = await deleteOrganization(OWNER, 'OSIS')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION')
    expect(from).not.toHaveBeenCalled()
  })

  it('deletes the row, then the logo', async () => {
    const query: FakeQuery = fakeQuery({ data: [{ id: 'org-1' }], error: null })
    from.mockReturnValue(query)

    const result = await deleteOrganization(OWNER, 'osis nusantara')

    expect(result.ok).toBe(true)
    expect(query.calls.some((call) => call.method === 'delete')).toBe(true)
    expect(purgeOrganizationBranding).toHaveBeenCalledWith('org-1')
  })
})

describe('updateProfile', () => {
  it('keeps the name from sign-up when only the title is saved', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u-1', user_metadata: { full_name: 'Rani Putri' } } },
      error: null,
    })
    const read = fakeQuery({ data: null, error: null })
    const write = fakeQuery({
      data: {
        display_name: 'Rani Putri',
        title: 'Sekretaris',
        notify_analysis_finished: true,
      },
      error: null,
    })
    const queue = [read, write]
    from.mockImplementation(() => queue.shift())

    const result = await updateProfile({ title: 'Sekretaris' })

    expect(result.ok).toBe(true)
    expect(argsOf(write, 'upsert')?.[0]).toMatchObject({
      user_id: 'u-1',
      display_name: 'Rani Putri',
      title: 'Sekretaris',
      notify_analysis_finished: true,
    })
  })

  it('keeps an existing notification choice when the name changes', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    const read = fakeQuery({
      data: { display_name: 'Rani', title: 'Ketua', notify_analysis_finished: false },
      error: null,
    })
    const write = fakeQuery({
      data: { display_name: 'Rani P', title: 'Ketua', notify_analysis_finished: false },
      error: null,
    })
    const queue = [read, write]
    from.mockImplementation(() => queue.shift())

    await updateProfile({ displayName: 'Rani P' })

    expect(argsOf(write, 'upsert')?.[0]).toMatchObject({
      display_name: 'Rani P',
      title: 'Ketua',
      notify_analysis_finished: false,
    })
  })
})
