/**
 * One id per request, carried from the edge through to every log line.
 *
 * Without it the logs are a flat stream: when a user says "the upload failed
 * around 3pm" there is no way to pull out the handful of lines that belong to
 * their request, because the fields that would join them (`jobId`, `datasetId`)
 * are exactly the ones that do not exist yet when the failure happens.
 *
 * Lives in `lib/` because the middleware (Edge runtime) and the route handlers
 * (Node) both need it, and it must not depend on a module.
 */

export const REQUEST_ID_HEADER = 'x-request-id'

/** Short enough to read aloud, long enough not to collide within a day's logs. */
export function createRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Prefers an id the platform already assigned, so one request has one id across
 * Vercel's own logs and ours. Anything that is not 8–64 hex-ish characters is
 * discarded rather than trusted: this value ends up in log lines, and a header
 * is attacker-controlled.
 */
export function readRequestId(value: string | null | undefined): string {
  if (!value) return createRequestId()
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : createRequestId()
}
