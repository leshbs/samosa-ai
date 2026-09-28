/**
 * Retry policy for LLM calls. Separate from the adapter so the backoff maths
 * can be tested without a fake clock spanning real seconds.
 */

export const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8_000

/** Status codes worth retrying: rate limits and transient server faults. */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false
  // 408 request timeout and 409 conflict are transient; other 4xx are our bug.
  return status === 408 || status === 409 || status === 429 || status >= 500
}

/**
 * A network error surfaces with no status at all. Those are retryable — the
 * request may never have reached the provider.
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number') return isRetryableStatus(status)
  return 'code' in error || 'errno' in error
}

/**
 * Exponential backoff with full jitter. Without jitter, a batch of concurrent
 * requests that all hit a 429 would retry in lockstep and rate-limit again.
 */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  return Math.round(random() * ceiling)
}

/** Honours the provider's own `retry-after` hint when it sends one. */
export function retryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const headers = (error as { headers?: unknown }).headers
  if (typeof headers !== 'object' || headers === null) return undefined

  const raw = (headers as Record<string, unknown>)['retry-after']
  if (typeof raw !== 'string') return undefined

  const seconds = Number.parseFloat(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}
