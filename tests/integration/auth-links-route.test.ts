// @vitest-environment node
// Route handlers build NextResponse redirects, which want the real Request/URL.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const completeSignIn = vi.fn()
const exchangeAuthCode = vi.fn()
const verifyEmailLink = vi.fn()

vi.mock('@/modules/auth', () => ({
  EMAIL_LINK_TYPES: [
    'signup',
    'email',
    'recovery',
    'email_change',
    'invite',
    'magiclink',
  ],
  completeSignIn,
  exchangeAuthCode,
  isJoining: (next: string) => next.startsWith('/invite/'),
  verifyEmailLink,
}))

const { GET: confirm } = await import('@/app/(auth)/confirm/route')
const { GET: callback } = await import('@/app/(auth)/callback/route')

const OK = { ok: true, value: undefined }
const FAILED = { ok: false, error: { code: 'UNAUTHORIZED', message: 'x' } }

function get(path: string): NextRequest {
  return new Request(`http://localhost:3000${path}`) as unknown as NextRequest
}

/** Where the handler sent the browser, as a path. */
function location(response: Response): string {
  const url = new URL(response.headers.get('location') ?? '')
  return `${url.pathname}${url.search}`
}

beforeEach(() => {
  completeSignIn
    .mockReset()
    .mockResolvedValue({ ok: true, value: { organizationId: 'o' } })
  exchangeAuthCode.mockReset().mockResolvedValue(OK)
  verifyEmailLink.mockReset().mockResolvedValue(OK)
})

describe('GET /confirm', () => {
  it('confirms a signup link, provisions, and follows next', async () => {
    const response = await confirm(get('/confirm?token_hash=h&type=email&next=/reports'))

    expect(verifyEmailLink).toHaveBeenCalledWith('h', 'email')
    expect(completeSignIn).toHaveBeenCalledWith({ joining: false })
    expect(location(response)).toBe('/reports')
  })

  it('creates nothing for a signup that is on its way to an invitation', async () => {
    const response = await confirm(
      get('/confirm?token_hash=h&type=email&next=/invite/abc'),
    )

    expect(completeSignIn).toHaveBeenCalledWith({ joining: true })
    expect(location(response)).toBe('/invite/abc')
  })

  it('sends a recovery link to the new-password form by default', async () => {
    const response = await confirm(get('/confirm?token_hash=h&type=recovery'))

    expect(location(response)).toBe('/reset-password')
  })

  it('sends an expired recovery link back to ask for a new one', async () => {
    verifyEmailLink.mockResolvedValue(FAILED)

    const response = await confirm(get('/confirm?token_hash=h&type=recovery'))

    expect(location(response)).toBe('/forgot-password?error=expired')
    expect(completeSignIn).not.toHaveBeenCalled()
  })

  it('reports an expired signup link on the login page', async () => {
    verifyEmailLink.mockResolvedValue(FAILED)

    const response = await confirm(get('/confirm?token_hash=h&type=signup'))

    expect(location(response)).toBe('/login?error=invalid_code')
  })

  it('rejects an unknown link type instead of passing it to Supabase', async () => {
    const response = await confirm(get('/confirm?token_hash=h&type=sms'))

    expect(verifyEmailLink).not.toHaveBeenCalled()
    expect(location(response)).toBe('/login?error=missing_code')
  })

  it('still accepts the PKCE code from Supabase stock templates', async () => {
    const response = await confirm(get('/confirm?code=c&next=/dashboard'))

    expect(exchangeAuthCode).toHaveBeenCalledWith('c')
    expect(location(response)).toBe('/dashboard')
  })

  it('explains a PKCE link opened in another browser rather than calling it expired', async () => {
    exchangeAuthCode.mockResolvedValue(FAILED)

    const signup = await confirm(get('/confirm?code=c&next=/dashboard'))
    const recovery = await confirm(get('/confirm?code=c&next=/reset-password'))

    expect(location(signup)).toBe('/login?error=other_browser')
    expect(location(recovery)).toBe('/forgot-password?error=other_browser')
  })

  it('never follows next off-site', async () => {
    const response = await confirm(
      get('/confirm?token_hash=h&type=email&next=/%5Cevil.test'),
    )

    expect(location(response)).toBe('/dashboard')
  })

  it('reports a provisioning failure', async () => {
    completeSignIn.mockResolvedValue(FAILED)

    const response = await confirm(get('/confirm?token_hash=h&type=email'))

    expect(location(response)).toBe('/login?error=provisioning')
  })
})

describe('GET /callback', () => {
  it('exchanges the OAuth code, provisions, and follows next', async () => {
    const response = await callback(get('/callback?code=c&next=/datasets'))

    expect(exchangeAuthCode).toHaveBeenCalledWith('c')
    expect(completeSignIn).toHaveBeenCalledWith({ joining: false })
    expect(location(response)).toBe('/datasets')
  })

  it('creates nothing for a Google signup that is on its way to an invitation', async () => {
    await callback(get('/callback?code=c&next=/invite/abc'))

    expect(completeSignIn).toHaveBeenCalledWith({ joining: true })
  })

  it('never follows next off-site', async () => {
    const response = await callback(get('/callback?code=c&next=//evil.test'))

    expect(location(response)).toBe('/dashboard')
  })

  it('reports a missing or rejected code', async () => {
    expect(location(await callback(get('/callback')))).toBe('/login?error=missing_code')

    exchangeAuthCode.mockResolvedValue(FAILED)
    expect(location(await callback(get('/callback?code=c')))).toBe(
      '/login?error=invalid_code',
    )
  })
})
