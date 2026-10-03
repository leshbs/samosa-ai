import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/lib/env'
import { REQUEST_ID_HEADER, readRequestId } from '@/lib/observability/request-id'
import { safeNextPath } from '@/lib/security/safe-next-path'
import { isSameOrigin } from '@/lib/security/same-origin'

/**
 * Everything behind the dashboard shell requires a session, and so does the
 * welcome page for an account that is in no workspace.
 */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/datasets',
  '/analysis',
  '/reports',
  '/settings',
  '/profile',
  '/welcome',
]
/** Pages for signed-out users; a signed-in visitor is sent to the dashboard. */
const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/verify-email']
/**
 * Outside the dashboard shell but still needs a session — the one the recovery
 * link created. Without it the form has nothing to update, so the only useful
 * place to send the user is back to asking for a fresh link.
 */
const RECOVERY_PAGE = '/reset-password'

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * A fresh nonce per request. `btoa` and `crypto` both exist on the Edge
 * runtime; `Buffer` does not, which is why this is not the usual one-liner.
 */
function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Content Security Policy.
 *
 * `strict-dynamic` with a per-request nonce is the form Next.js supports: it
 * reads the nonce off the request header and stamps it onto the scripts it
 * generates itself, so no build-time hash list has to be maintained.
 *
 * `style-src` keeps `unsafe-inline` because Radix positions its popovers by
 * writing inline styles at runtime — there is no nonce to give them. Inline
 * styles cannot execute script, so this costs far less than the script-src
 * equivalent would.
 *
 * `connect-src` has to name the Supabase project twice: `https:` for PostgREST
 * and auth, `wss:` for the realtime socket the report page subscribes to.
 */
function contentSecurityPolicy(nonce: string, isSecure: boolean): string {
  const supabase = new URL(clientEnv.NEXT_PUBLIC_SUPABASE_URL).origin
  const supabaseSocket = supabase.replace(/^https:/, 'wss:')
  const isDev = process.env.NODE_ENV !== 'production'

  const directives = [
    `default-src 'self'`,
    // 'wasm-unsafe-eval' lets WebAssembly compile and nothing else: the layout
    // engine behind "Unduh PDF" is a wasm module, and without this the download
    // fails in production only (ADR-0014). It does not allow eval() — React
    // Refresh needs that, and production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    // Logos and avatars are private objects served by short-lived signed URLs
    // straight from Supabase Storage.
    `img-src 'self' data: blob: ${supabase}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabase} ${supabaseSocket}`,
    // The report PDF is downloaded, never framed, so nothing needs to embed us.
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ]

  /**
   * Keyed to the scheme this request actually arrived on, not to NODE_ENV.
   * A production build served over plain HTTP — `pnpm start` on localhost, or
   * a self-hosted box on a LAN — had every same-origin navigation rewritten to
   * `https://localhost` and failing with ERR_SSL_PROTOCOL_ERROR. The symptom
   * was a dead "Mulai analisis" link, nowhere near anything labelled CSP.
   */
  if (isSecure) directives.push('upgrade-insecure-requests')

  return directives.join('; ')
}

/**
 * Refreshes the Supabase session cookie on every navigation, gates the
 * dashboard, rejects cross-site writes, and sets the per-request CSP.
 *
 * The session check here is a redirect for the common case, not the security
 * boundary — that is RLS. The origin check *is* a boundary.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const originCheck = {
    method: request.method,
    pathname,
    origin: request.headers.get('origin'),
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
  }

  if (!isSameOrigin(originCheck)) {
    // Deliberately terse and deliberately not a redirect: a forged request
    // should learn nothing about whether the session it rode in on was valid.
    return new NextResponse(
      JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'Permintaan lintas situs ditolak' },
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )
  }

  // One id for this request, reused if the platform already assigned one so a
  // single request has one id across Vercel's logs and ours.
  const requestId = readRequestId(request.headers.get(REQUEST_ID_HEADER))

  const nonce = createNonce()
  // Behind a proxy that terminates TLS the URL is http, so trust the header.
  const isSecure =
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.nextUrl.protocol === 'https:'
  const csp = contentSecurityPolicy(nonce, isSecure)

  // Next reads these off the *request* to nonce its own inline bootstrap.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)
  // Echoed so a user can read the id off the network tab, or off an error
  // response, and quote the exact request that failed.
  response.headers.set(REQUEST_ID_HEADER, requestId)

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
        ) => {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A redirect replaces `response`, so it has to carry the same headers.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    redirect.headers.set('content-security-policy', csp)
    redirect.headers.set(REQUEST_ID_HEADER, requestId)
    return redirect
  }

  if (!user && isProtected(pathname)) {
    const login = new URL('/login', request.url)
    // Send them back where they were headed once they are signed in.
    login.searchParams.set('next', `${pathname}${search}`)
    return redirectTo(login)
  }

  if (!user && pathname === RECOVERY_PAGE) {
    return redirectTo(new URL('/forgot-password?error=expired', request.url))
  }

  // A signed-in user normally has no business on the login page. The exception
  // is a page carrying an `error`: that is the dashboard telling us this user
  // cannot enter (no organization yet), and bouncing them back would loop
  // /dashboard -> /login -> /dashboard until the browser gives up.
  const hasError = request.nextUrl.searchParams.has('error')
  if (user && AUTH_PAGES.includes(pathname) && !hasError) {
    // Honour `next`: an invitation link sends a signed-in user through
    // /login?next=/invite/..., and dropping them on the dashboard loses it.
    const next = safeNextPath(request.nextUrl.searchParams.get('next'))
    return redirectTo(new URL(next, request.url))
  }

  return response
}

export const config = {
  // `ttf`: the PDF's font files in /public/fonts. Three requests on the first
  // "Unduh PDF", none of which needs a session refresh in front of it.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ttf)$).*)',
  ],
}
