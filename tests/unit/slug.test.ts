import { describe, expect, it } from 'vitest'
import { slugify, withSuffix } from '@/modules/auth/services/slug'

describe('slugify', () => {
  it('lowercases and hyphenates an organization name', () => {
    expect(slugify('OSIS SMA Nusantara')).toBe('osis-sma-nusantara')
  })

  it('strips accents so lookalike names collapse to one slug', () => {
    expect(slugify('Sékolah Ngawi')).toBe('sekolah-ngawi')
  })

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('  OSIS // SMA #1  ')).toBe('osis-sma-1')
  })

  it('never returns an empty slug, which would not be unique', () => {
    expect(slugify('!!!')).toBe('org')
    expect(slugify('')).toBe('org')
  })

  it('caps the length and leaves no trailing hyphen', () => {
    const slug = slugify('a'.repeat(30) + ' ' + 'b'.repeat(40))

    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('withSuffix', () => {
  it('appends the suffix for a retry after a slug collision', () => {
    expect(withSuffix('osis-sma-nusantara', 'a1b2c3')).toBe('osis-sma-nusantara-a1b2c3')
  })

  it('keeps the result inside the length cap', () => {
    expect(withSuffix('x'.repeat(48), 'a1b2c3').length).toBeLessThanOrEqual(48)
  })
})
