// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { secretsMatch, verifyWorkerSecret } from '@/lib/worker-auth'

describe('secretsMatch', () => {
  const expected = 'a-long-shared-worker-secret'

  it('accepts the exact secret', () => {
    expect(secretsMatch(expected, expected)).toBe(true)
  })

  it('rejects a missing or empty header', () => {
    expect(secretsMatch(null, expected)).toBe(false)
    expect(secretsMatch('', expected)).toBe(false)
  })

  it('rejects near misses and different lengths without throwing', () => {
    expect(secretsMatch('a-long-shared-worker-secreT', expected)).toBe(false)
    expect(secretsMatch('short', expected)).toBe(false)
    expect(secretsMatch(`${expected}-extra`, expected)).toBe(false)
  })
})

describe('verifyWorkerSecret', () => {
  it('reads the expected secret from validated env', () => {
    expect(verifyWorkerSecret('test-worker-secret')).toBe(true)
    expect(verifyWorkerSecret('wrong-worker-secret')).toBe(false)
  })
})
