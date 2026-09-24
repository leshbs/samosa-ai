import { describe, expect, it } from 'vitest'
import { createRequestId, readRequestId } from '@/lib/observability/request-id'

describe('createRequestId', () => {
  it('is 16 hex characters', () => {
    expect(createRequestId()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, createRequestId))
    expect(ids.size).toBe(500)
  })
})

describe('readRequestId', () => {
  it('keeps an id the platform already assigned', () => {
    expect(readRequestId('abc123def456')).toBe('abc123def456')
  })

  it('trims surrounding whitespace', () => {
    expect(readRequestId('  abc123def456  ')).toBe('abc123def456')
  })

  it('mints a new one when the header is absent', () => {
    expect(readRequestId(null)).toMatch(/^[0-9a-f]{16}$/)
    expect(readRequestId(undefined)).toMatch(/^[0-9a-f]{16}$/)
    expect(readRequestId('')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('refuses a header that is not id-shaped', () => {
    // This value is written into log lines, and the header is caller
    // controlled: a newline would let it forge a second JSON log entry.
    for (const hostile of [
      'a b',
      'short',
      'x'.repeat(65),
      'id\nlevel":"error"',
      '{"a":1}',
      '../../etc/passwd',
    ]) {
      expect(readRequestId(hostile)).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  it('accepts the hyphenated and underscored ids proxies emit', () => {
    expect(readRequestId('req-1a2b3c4d')).toBe('req-1a2b3c4d')
    expect(readRequestId('req_1a2b3c4d')).toBe('req_1a2b3c4d')
  })
})
