import { describe, expect, it } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'
import {
  BACKEND_UNREACHABLE_MESSAGE,
  RATE_LIMITED_MESSAGE,
  describeAuthError,
  isBackendUnreachable,
  isEmailNotConfirmed,
} from '@/lib/supabase/auth-error'

function authError(status: number | undefined, code?: string): AuthError {
  return { name: 'AuthApiError', message: 'boom', status, code } as AuthError
}

describe('isBackendUnreachable', () => {
  it('treats a failed fetch (status 0) as an outage, not a bad password', () => {
    expect(isBackendUnreachable(authError(0))).toBe(true)
  })

  it('treats a broken auth server as an outage', () => {
    expect(isBackendUnreachable(authError(503))).toBe(true)
  })

  it('treats an unknown error as an outage rather than blaming the user', () => {
    expect(isBackendUnreachable(authError(undefined))).toBe(true)
  })

  it('leaves a genuine credential rejection alone', () => {
    expect(isBackendUnreachable(authError(400))).toBe(false)
    expect(isBackendUnreachable(authError(401))).toBe(false)
  })
})

describe('isEmailNotConfirmed', () => {
  it('recognises an unconfirmed address by its code, not its message', () => {
    expect(isEmailNotConfirmed(authError(400, 'email_not_confirmed'))).toBe(true)
    expect(isEmailNotConfirmed(authError(400, 'invalid_credentials'))).toBe(false)
  })
})

describe('describeAuthError', () => {
  it('names a rate limit, whether by status or by code', () => {
    expect(describeAuthError(authError(429), 'x')).toBe(RATE_LIMITED_MESSAGE)
    expect(describeAuthError(authError(400, 'over_email_send_rate_limit'), 'x')).toBe(
      RATE_LIMITED_MESSAGE,
    )
  })

  it('names an outage', () => {
    expect(describeAuthError(authError(0), 'x')).toBe(BACKEND_UNREACHABLE_MESSAGE)
  })

  it('explains a rejection the user can fix', () => {
    expect(describeAuthError(authError(422, 'same_password'), 'x')).toMatch(/berbeda/)
    expect(describeAuthError(authError(422, 'weak_password'), 'x')).toMatch(/lemah/)
  })

  it("keeps the caller's deliberately vague message for everything else", () => {
    expect(
      describeAuthError(
        authError(400, 'invalid_credentials'),
        'Email atau password salah.',
      ),
    ).toBe('Email atau password salah.')
  })
})
