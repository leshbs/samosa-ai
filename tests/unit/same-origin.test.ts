import { describe, expect, it } from 'vitest'
import { isSameOrigin, requiresOriginCheck } from '@/lib/security/same-origin'

const post = (overrides: Partial<Parameters<typeof isSameOrigin>[0]> = {}) => ({
  method: 'POST',
  pathname: '/api/datasets',
  origin: 'https://samosa.app',
  host: 'samosa.app',
  ...overrides,
})

describe('requiresOriginCheck', () => {
  it('exempts the safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(requiresOriginCheck(post({ method }))).toBe(false)
    }
  })

  it('covers every write method', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(requiresOriginCheck(post({ method }))).toBe(true)
    }
  })

  it('exempts the worker webhook, which has no browser origin', () => {
    expect(requiresOriginCheck(post({ pathname: '/api/webhooks/inngest' }))).toBe(false)
  })
})

describe('isSameOrigin', () => {
  it('allows a write from our own origin', () => {
    expect(isSameOrigin(post())).toBe(true)
  })

  it('ignores the scheme and port mismatch that a proxy introduces', () => {
    // Vercel terminates TLS upstream, so Origin is https while Host is bare.
    expect(isSameOrigin(post({ origin: 'https://samosa.app', host: 'samosa.app' }))).toBe(
      true,
    )
  })

  it('rejects a write from another site', () => {
    expect(isSameOrigin(post({ origin: 'https://evil.example' }))).toBe(false)
  })

  it('rejects a write with no Origin at all', () => {
    // Every browser sends one on fetch and on form posts. Its absence means a
    // non-browser client, which should be using the webhook and its secret.
    expect(isSameOrigin(post({ origin: null }))).toBe(false)
  })

  it('rejects an Origin that is not a URL', () => {
    expect(isSameOrigin(post({ origin: 'null' }))).toBe(false)
  })

  it('still allows reads with no Origin', () => {
    expect(isSameOrigin(post({ method: 'GET', origin: null }))).toBe(true)
  })

  it('distinguishes a look-alike host', () => {
    expect(isSameOrigin(post({ origin: 'https://samosa.app.evil.example' }))).toBe(false)
  })
})
