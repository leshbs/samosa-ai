import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/security/safe-next-path'

describe('safeNextPath', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeNextPath('/reports/abc?tab=1#x')).toBe('/reports/abc?tab=1#x')
  })

  it('falls back when there is nothing to follow', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
  })

  it('rejects absolute URLs', () => {
    expect(safeNextPath('https://evil.test/dashboard')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.test')).toBe('/dashboard')
  })

  it('rejects the backslash spelling browsers treat as a protocol-relative URL', () => {
    expect(safeNextPath('/\\evil.test')).toBe('/dashboard')
    expect(safeNextPath('/\\/evil.test')).toBe('/dashboard')
  })

  it('uses the caller-supplied fallback', () => {
    expect(safeNextPath('//evil.test', '/reset-password')).toBe('/reset-password')
  })
})
