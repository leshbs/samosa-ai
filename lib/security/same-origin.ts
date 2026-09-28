/**
 * Cross-site request forgery defence for the state-changing routes.
 *
 * Supabase's auth cookies are SameSite=Lax, which already stops a cross-site
 * POST from carrying them, so this is the second lock rather than the first:
 * Lax is a browser default that a future cookie option could silently undo,
 * and `fetch` from an attacker's page always sends an `Origin` header we can
 * check ourselves.
 *
 * Lives in `lib/` because both the middleware (Edge runtime) and tests import
 * it, and it must stay free of any module or app dependency.
 */

/** Methods the spec defines as safe; they change nothing, so they are exempt. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Callers that legitimately have no browser origin. The worker webhook proves
 * itself with a shared secret instead, and `/api/auth` is hit by Supabase's
 * redirect back from Google.
 */
const EXEMPT_PREFIXES = ['/api/webhooks/'] as const

export type OriginCheckInput = {
  method: string
  pathname: string
  /** The `Origin` request header, absent on same-origin GETs and server calls. */
  origin: string | null
  /** The host the request actually arrived on, from `Host` or `X-Forwarded-Host`. */
  host: string | null
}

export function requiresOriginCheck(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false
  return !EXEMPT_PREFIXES.some((prefix) => input.pathname.startsWith(prefix))
}

/**
 * True when the request may proceed.
 *
 * A missing `Origin` on an unsafe method is refused. Every browser sends it on
 * `fetch` and on form posts, so an absent one means a non-browser client —
 * which should be using the webhook route and its secret, not a session cookie.
 */
export function isSameOrigin(input: OriginCheckInput): boolean {
  if (!requiresOriginCheck(input)) return true
  if (!input.origin || !input.host) return false

  try {
    return new URL(input.origin).host === input.host
  } catch {
    // An unparseable Origin is not a same-origin request by any reading.
    return false
  }
}
