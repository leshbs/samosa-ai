import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()
const provisionOrganization = vi.fn()
const ensureProfile = vi.fn()
const hasProfile = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser, exchangeCodeForSession, verifyOtp } }),
}))

vi.mock('@/modules/auth/services/provision', () => ({ provisionOrganization }))
vi.mock('@/modules/auth/services/profile', () => ({ ensureProfile, hasProfile }))

const {
  completeSignIn,
  exchangeAuthCode,
  isJoining,
  organizationNameFor,
  verifyEmailLink,
} = await import('@/modules/auth/services/sign-in')

function signedInAs(metadata: Record<string, unknown>) {
  getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'ketua@osis.test', user_metadata: metadata } },
    error: null,
  })
}

beforeEach(() => {
  getUser.mockReset()
  exchangeCodeForSession.mockReset()
  verifyOtp.mockReset()
  provisionOrganization.mockReset()
  ensureProfile.mockReset()
  hasProfile.mockReset().mockResolvedValue(false)
  provisionOrganization.mockResolvedValue({
    ok: true,
    value: { organizationId: 'org-1' },
  })
})

describe('organizationNameFor', () => {
  it('prefers the name passed explicitly', () => {
    expect(
      organizationNameFor({ explicit: 'OSIS A', metadata: 'OSIS B', email: 'x@y.test' }),
    ).toBe('OSIS A')
  })

  it('uses the name stored at signup when none is passed', () => {
    expect(
      organizationNameFor({ metadata: '  OSIS Nusantara ', email: 'x@y.test' }),
    ).toBe('OSIS Nusantara')
  })

  it('does not trust metadata that is not a sensible name', () => {
    expect(organizationNameFor({ metadata: 42, email: 'ketua@osis.test' })).toBe(
      'Ruang kerja ketua',
    )
    expect(
      organizationNameFor({ metadata: 'x'.repeat(121), email: 'ketua@osis.test' }),
    ).toBe('Ruang kerja ketua')
    expect(organizationNameFor({ metadata: ' ', email: 'ketua@osis.test' })).toBe(
      'Ruang kerja ketua',
    )
  })

  it('still produces a name without an email', () => {
    expect(organizationNameFor({ metadata: undefined, email: '' })).toBe('Ruang kerja')
  })
})

describe('completeSignIn', () => {
  it('gives a first arrival a workspace under the name typed at signup', async () => {
    signedInAs({ organization_name: 'OSIS Nusantara' })

    const result = await completeSignIn()

    expect(result).toEqual({ ok: true, value: { organizationId: 'org-1' } })
    expect(provisionOrganization).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationName: 'OSIS Nusantara',
    })
  })

  it('falls back to a name from the email for an OAuth signup', async () => {
    signedInAs({ full_name: 'Ketua OSIS' })

    await completeSignIn()

    expect(provisionOrganization).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationName: 'Ruang kerja ketua',
    })
  })

  it('seeds a profile from the signup metadata once provisioned', async () => {
    signedInAs({ full_name: 'Rani Putri' })

    await completeSignIn()

    expect(ensureProfile).toHaveBeenCalledWith('user-1', { full_name: 'Rani Putri' })
  })

  it('leaves the profile alone when provisioning failed, so the next sign-in retries', async () => {
    signedInAs({})
    provisionOrganization.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'x' },
    })

    const result = await completeSignIn()

    expect(result.ok).toBe(false)
    expect(ensureProfile).not.toHaveBeenCalled()
  })

  it('creates nothing for a first arrival through an invitation', async () => {
    signedInAs({ full_name: 'Budi' })

    const result = await completeSignIn({ joining: true })

    expect(result).toEqual({ ok: true, value: { organizationId: null } })
    expect(provisionOrganization).not.toHaveBeenCalled()
    // Still recorded as arrived: declining the invitation must not turn the
    // next sign-in into a first arrival.
    expect(ensureProfile).toHaveBeenCalledWith('user-1', { full_name: 'Budi' })
  })

  it('never creates anything on a later sign-in', async () => {
    signedInAs({ organization_name: 'OSIS Nusantara' })
    hasProfile.mockResolvedValue(true)

    const result = await completeSignIn({ organizationName: 'OSIS Baru' })

    expect(result).toEqual({ ok: true, value: { organizationId: null } })
    expect(provisionOrganization).not.toHaveBeenCalled()
    expect(ensureProfile).not.toHaveBeenCalled()
  })

  it('refuses without a session and provisions nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await completeSignIn()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
    expect(provisionOrganization).not.toHaveBeenCalled()
  })
})

describe('isJoining', () => {
  it('is true only for an invitation link', () => {
    expect(isJoining('/invite/abc')).toBe(true)
    expect(isJoining('/dashboard')).toBe(false)
    expect(isJoining('/invited')).toBe(false)
    expect(isJoining(undefined)).toBe(false)
  })
})

describe('exchangeAuthCode', () => {
  it('reports a rejected code as UNAUTHORIZED', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } })

    const result = await exchangeAuthCode('abc')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })

  it('succeeds when Supabase accepts the code', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })

    expect((await exchangeAuthCode('abc')).ok).toBe(true)
  })
})

describe('verifyEmailLink', () => {
  it('redeems the token hash with the link type', async () => {
    verifyOtp.mockResolvedValue({ error: null })

    const result = await verifyEmailLink('hash-1', 'recovery')

    expect(result.ok).toBe(true)
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'recovery' })
  })

  it('reports an expired or reused link as UNAUTHORIZED', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } })

    const result = await verifyEmailLink('hash-1', 'email')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })
})
