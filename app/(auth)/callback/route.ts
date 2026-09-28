import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/security/safe-next-path'
import { completeSignIn, exchangeAuthCode } from '@/modules/auth'

/**
 * OAuth landing point. Supabase redirects here with a `code` that has to be
 * exchanged for a session cookie before any redirect, otherwise the user
 * arrives at the dashboard signed out. Email links land on /confirm instead.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNextPath(url.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const exchanged = await exchangeAuthCode(code)
  if (!exchanged.ok) {
    return NextResponse.redirect(new URL('/login?error=invalid_code', url.origin))
  }

  // First OAuth sign-in has no organization yet; a repeat call is a no-op.
  const provisioned = await completeSignIn()
  if (!provisioned.ok) {
    return NextResponse.redirect(new URL('/login?error=provisioning', url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
