import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { safeNextPath } from '@/lib/security/safe-next-path'
import {
  EMAIL_LINK_TYPES,
  completeSignIn,
  exchangeAuthCode,
  verifyEmailLink,
} from '@/modules/auth'

const tokenLinkSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(EMAIL_LINK_TYPES),
})

/**
 * Landing point for every link we email: signup confirmation, password reset,
 * email change.
 *
 * Our templates (`supabase/templates/`) send `token_hash` + `type`, which works
 * on any device. Supabase's stock templates instead bounce through its own
 * /verify and arrive with a PKCE `code`; that is still accepted so a project
 * whose templates were never replaced keeps working in the same browser.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams)
  const isRecovery = params.type === 'recovery'
  const next = safeNextPath(params.next, isRecovery ? '/reset-password' : undefined)

  const fail = (path: string) => NextResponse.redirect(new URL(path, url.origin))
  const expired = isRecovery
    ? '/forgot-password?error=expired'
    : '/login?error=invalid_code'

  const tokenLink = tokenLinkSchema.safeParse(params)
  if (tokenLink.success) {
    const verified = await verifyEmailLink(tokenLink.data.token_hash, tokenLink.data.type)
    if (!verified.ok) return fail(expired)
  } else if (params.code) {
    const exchanged = await exchangeAuthCode(params.code)
    // Supabase has already confirmed the address by the time it hands out the
    // code; only the session failed, typically because the link was opened in
    // another browser. "Expired" would send the user off to sign up again.
    if (!exchanged.ok) {
      return fail(
        next === '/reset-password'
          ? '/forgot-password?error=other_browser'
          : '/login?error=other_browser',
      )
    }
  } else {
    return fail('/login?error=missing_code')
  }

  // A confirmed signup gets its organization here, under the name typed on the
  // form. For every other link type the user already has one and this is a no-op.
  const provisioned = await completeSignIn()
  if (!provisioned.ok) return fail('/login?error=provisioning')

  return NextResponse.redirect(new URL(next, url.origin))
}
