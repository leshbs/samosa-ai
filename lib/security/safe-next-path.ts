/**
 * Open-redirect defence for every `?next=` the auth flow carries.
 *
 * `next` arrives from the query string, so an attacker can put anything in it,
 * and it is followed right after a successful sign-in — the one moment the user
 * trusts whatever page appears. Only a same-origin *path* survives.
 *
 * `startsWith('/')` alone is not that: `//evil.test` is a protocol-relative URL,
 * and browsers read `/\evil.test` the same way because they treat a backslash
 * as a slash. Resolving against a throwaway origin and checking the origin did
 * not change catches both, plus any spelling of them nobody has thought of yet.
 *
 * Lives in `lib/` because the middleware (Edge runtime), route handlers and
 * server pages all need it, and it must stay free of module dependencies.
 */

const PROBE_ORIGIN = 'http://next-path.invalid'

export const DEFAULT_NEXT_PATH = '/dashboard'

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH,
): string {
  if (!raw || !raw.startsWith('/')) return fallback

  let resolved: URL
  try {
    resolved = new URL(raw, PROBE_ORIGIN)
  } catch {
    return fallback
  }

  if (resolved.origin !== PROBE_ORIGIN) return fallback
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
