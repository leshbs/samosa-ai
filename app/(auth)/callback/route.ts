import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, provisionOrganization } from '@/modules/auth'
import { logger } from '@/modules/shared'

/** Fallback organization name for OAuth signups, which never see our form. */
function defaultOrganizationName(email: string): string {
  const handle = email.split('@')[0] ?? 'Organisasi'
  return `Organisasi ${handle}`
}

/**
 * OAuth and magic-link landing point. Supabase redirects here with a `code`
 * that has to be exchanged for a session cookie before any redirect, otherwise
 * the user arrives at the dashboard signed out.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // Only same-origin paths — an attacker-supplied absolute URL would be an open redirect.
  const rawNext = url.searchParams.get('next') ?? '/dashboard'
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    logger.warn('auth.callback.exchange_failed', { reason: error.message })
    return NextResponse.redirect(new URL('/login?error=invalid_code', url.origin))
  }

  const user = await getAuthUser()
  if (user.ok) {
    // First OAuth sign-in has no organization yet; a repeat call is a no-op.
    const provisioned = await provisionOrganization({
      userId: user.value.userId,
      organizationName: defaultOrganizationName(user.value.email),
    })
    if (!provisioned.ok) {
      return NextResponse.redirect(new URL('/login?error=provisioning', url.origin))
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
