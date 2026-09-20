import { describe, expect, it } from 'vitest'
import {
  USD_TO_IDR,
  estimateCostMicroIdr,
  formatIdr,
  rateFor,
} from '@/modules/analysis/adapters/pricing'
import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  isRetryableError,
  isRetryableStatus,
  retryAfterMs,
} from '@/modules/analysis/adapters/retry'

describe('rateFor', () => {
  it('returns the published rate for a known model', () => {
    expect(rateFor('gpt-4o-mini')).toEqual({
      inputUsdPerMillion: 0.15,
      outputUsdPerMillion: 0.6,
    })
  })

  it('matches a dated deployment id by prefix', () => {
    expect(rateFor('gpt-4o-mini-2024-07-18')).toEqual(rateFor('gpt-4o-mini'))
  })

  it('prefers the longest prefix, so a mini model is not priced as its parent', () => {
    expect(rateFor('gpt-4.1-mini-2025-01-01')).toEqual(rateFor('gpt-4.1-mini'))
    expect(rateFor('gpt-4.1-mini')).not.toEqual(rateFor('gpt-4.1'))
  })

  it('falls back to the default rate rather than reporting a free call', () => {
    expect(rateFor('some-unreleased-model')).toEqual(rateFor('gpt-4o-mini'))
  })
})

describe('estimateCostMicroIdr', () => {
  it('prices a million input tokens at the published rate', () => {
    const cost = estimateCostMicroIdr('gpt-4o-mini', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    })

    // 0.15 USD * rate, expressed in millionths of a rupiah.
    expect(cost).toBe(Math.round(0.15 * USD_TO_IDR * 1_000_000))
  })

  it('charges output tokens at their higher rate', () => {
    const input = estimateCostMicroIdr('gpt-4o-mini', {
      inputTokens: 1000,
      outputTokens: 0,
    })
    const output = estimateCostMicroIdr('gpt-4o-mini', {
      inputTokens: 0,
      outputTokens: 1000,
    })

    expect(output).toBeGreaterThan(input)
  })

  it('returns an integer, so summing thousands of batches cannot drift', () => {
    const cost = estimateCostMicroIdr('gpt-4o-mini', {
      inputTokens: 1234,
      outputTokens: 567,
    })

    expect(Number.isInteger(cost)).toBe(true)
  })

  it('costs nothing for a call that used no tokens', () => {
    expect(estimateCostMicroIdr('gpt-4o-mini', { inputTokens: 0, outputTokens: 0 })).toBe(
      0,
    )
  })

  it('keeps a realistic batch well under the Rp 500 per-response target', () => {
    // 30 responses, roughly 4k in and 2k out.
    const cost = estimateCostMicroIdr('gpt-4o-mini', {
      inputTokens: 4000,
      outputTokens: 2000,
    })
    const perResponseIdr = cost / 1_000_000 / 30

    expect(perResponseIdr).toBeLessThan(500)
  })
})

describe('formatIdr', () => {
  it('renders micro-rupiah as rupiah', () => {
    expect(formatIdr(1_500 * 1_000_000)).toContain('1.500')
  })
})

describe('retry policy', () => {
  it('retries rate limits and server faults', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(408)).toBe(true)
  })

  it('does not retry the 4xx codes that mean our request was wrong', () => {
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(403)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
    expect(isRetryableStatus(undefined)).toBe(false)
  })

  it('treats a bare network error as retryable — it may never have arrived', () => {
    expect(
      isRetryableError(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      ),
    ).toBe(true)
    expect(isRetryableError(new Error('plain'))).toBe(false)
    expect(isRetryableError(null)).toBe(false)
  })

  it('grows the backoff ceiling with each attempt', () => {
    const full = () => 1
    expect(backoffDelayMs(0, full)).toBeLessThan(backoffDelayMs(1, full))
    expect(backoffDelayMs(1, full)).toBeLessThan(backoffDelayMs(2, full))
  })

  it('caps the backoff so a retry never waits absurdly long', () => {
    expect(backoffDelayMs(20, () => 1)).toBeLessThanOrEqual(8_000)
  })

  it('jitters, so concurrent batches do not retry in lockstep', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(0)
    expect(backoffDelayMs(3, () => 1)).toBeGreaterThan(0)
  })

  it('reads a retry-after header in seconds', () => {
    expect(retryAfterMs({ headers: { 'retry-after': '2.5' } })).toBe(2500)
    expect(retryAfterMs({ headers: {} })).toBeUndefined()
    expect(retryAfterMs({})).toBeUndefined()
    expect(retryAfterMs(null)).toBeUndefined()
  })

  it('stops at three attempts', () => {
    expect(MAX_ATTEMPTS).toBe(3)
  })
})
