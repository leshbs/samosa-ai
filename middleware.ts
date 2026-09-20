import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { clientEnv } from '@/lib/env'

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
 * Refreshes the Supabase session cookie on every navigation and gates the
 * dashboard. Server Components cannot write cookies, so an expired token would
 * otherwise log users out. The layouts check again — this is a redirect for the
 * common case, not the security boundary (that is RLS).
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

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

  const { pathname, search } = request.nextUrl

  if (!user && isProtected(pathname)) {
    const login = new URL('/login', request.url)
    // Send them back where they were headed once they are signed in.
    login.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(login)
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
