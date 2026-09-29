// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { unwrapPastedValue } from '@/lib/env'

describe('unwrapPastedValue', () => {
  it.each([
    ['gpt-4o-mini', 'gpt-4o-mini'],
    ['"gpt-4o-mini"', 'gpt-4o-mini'],
    ["'gpt-4o-mini'", 'gpt-4o-mini'],
    ['gpt-4o-mini ', 'gpt-4o-mini'],
    ['gpt-4o-mini\n', 'gpt-4o-mini'],
    [' "sk-test"\r\n', 'sk-test'],
  ])('cleans %j to %j', (raw, clean) => {
    expect(unwrapPastedValue(raw)).toBe(clean)
  })

  it('keeps a quote that is part of the value', () => {
    expect(unwrapPastedValue('"half-quoted')).toBe('"half-quoted')
  })

  it('treats a blank value as unset, so a default can apply', () => {
    expect(unwrapPastedValue('  ')).toBeUndefined()
    expect(unwrapPastedValue('""')).toBeUndefined()
    expect(unwrapPastedValue(undefined)).toBeUndefined()
  })
})

describe('serverEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('hands the OpenAI adapter the values without paste debris', async () => {
    vi.stubEnv('OPENAI_MODEL', '"gpt-4o-mini"\n')
    vi.stubEnv('OPENAI_API_KEY', ' sk-test ')
    const { serverEnv } = await import('@/lib/env')

    expect(serverEnv().OPENAI_MODEL).toBe('gpt-4o-mini')
    expect(serverEnv().OPENAI_API_KEY).toBe('sk-test')
  })

  it('falls back to the default model when the setting is blank', async () => {
    vi.stubEnv('OPENAI_MODEL', ' ')
    const { serverEnv } = await import('@/lib/env')

    expect(serverEnv().OPENAI_MODEL).toBe('gpt-4o-mini')
  })
})
