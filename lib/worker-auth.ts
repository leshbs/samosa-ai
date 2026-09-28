import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'

/**
 * Hashing first gives both buffers the same length, which `timingSafeEqual`
 * requires, and keeps the comparison from leaking the secret's length.
 */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time comparison, so response timing reveals nothing about the secret. */
export function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false
  return timingSafeEqual(digest(provided), digest(expected))
}

/** Checks the `x-worker-secret` header against the validated `WORKER_SECRET`. */
export function verifyWorkerSecret(provided: string | null): boolean {
  return secretsMatch(provided, serverEnv().WORKER_SECRET)
}
