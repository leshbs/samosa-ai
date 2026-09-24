import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/lib/env'
import { isSameOrigin } from '@/lib/security/same-origin'

/** Everything behind the dashboard shell requires a session. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/datasets',
  '/analysis',
  '/reports',
  '/settings',
]
const AUTH_PAGES = ['/login', '/signup']

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
    // React Refresh compiles modules with eval; production never needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
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

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)

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

  if (!user && isProtected(pathname)) {
    const login = new URL('/login', request.url)
    // Send them back where they were headed once they are signed in.
    login.searchParams.set('next', `${pathname}${search}`)
    const redirect = NextResponse.redirect(login)
    redirect.headers.set('content-security-policy', csp)
    return redirect
  }

  // A signed-in user normally has no business on the login page. The exception
  // is a page carrying an `error`: that is the dashboard telling us this user
  // cannot enter (no organization yet), and bouncing them back would loop
  // /dashboard -> /login -> /dashboard until the browser gives up.
  const hasError = request.nextUrl.searchParams.has('error')
  if (user && AUTH_PAGES.includes(pathname) && !hasError) {
    const redirect = NextResponse.redirect(new URL('/dashboard', request.url))
    redirect.headers.set('content-security-policy', csp)
    return redirect
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
