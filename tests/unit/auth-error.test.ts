import { describe, expect, it } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'
import { isBackendUnreachable } from '@/lib/supabase/auth-error'

function authError(status: number | undefined): AuthError {
  return { name: 'AuthApiError', message: 'boom', status } as AuthError
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
