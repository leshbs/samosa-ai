import 'server-only'

import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ORGANIZATION_NAME_METADATA_KEY } from '@/lib/supabase/user-metadata'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { provisionOrganization } from './provision'

/** The link types our email templates and Supabase's own links can carry. */
export const EMAIL_LINK_TYPES = [
  'signup',
  'email',
  'recovery',
  'email_change',
  'invite',
  'magiclink',
] as const satisfies readonly EmailOtpType[]

export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number]

const MIN_NAME = 2
const MAX_NAME = 120

/**
 * Picks the organization name for a first sign-in. What the user typed wins;
 * an OAuth signup never saw our form, so it gets a name built from the email.
 * Metadata is user-writable, so it is re-validated here rather than trusted.
 */
export function organizationNameFor(input: {
  explicit?: string
  metadata: unknown
  email: string
}): string {
  for (const candidate of [input.explicit, input.metadata]) {
    if (typeof candidate !== 'string') continue
    const name = candidate.trim()
    if (name.length >= MIN_NAME && name.length <= MAX_NAME) return name
  }

  const handle = input.email.split('@')[0] || 'Organisasi'
  return `Organisasi ${handle}`
}

/**
 * Makes sure the signed-in user has an organization, creating it on the first
 * call. Idempotent, so every entry point — OAuth callback, email link, password
 * sign-in — can call it and a user left without one by an earlier failure is
 * repaired on their next sign-in instead of stranded.
 */
export async function completeSignIn(
  organizationName?: string,
): Promise<Result<{ organizationId: string }, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }

  return provisionOrganization({
    userId: data.user.id,
    organizationName: organizationNameFor({
      explicit: organizationName,
      metadata: data.user.user_metadata?.[ORGANIZATION_NAME_METADATA_KEY],
      email: data.user.email ?? '',
    }),
  })
}

/**
 * Trades the one-time `code` Supabase appends to an OAuth (or PKCE email)
 * redirect for a session cookie. It only works in the browser that started the
 * flow, because the matching verifier lives in that browser's cookies.
 */
export async function exchangeAuthCode(code: string): Promise<Result<void, AppError>> {
  const supabase = await createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    logger.warn('auth.code_exchange_failed', { reason: error.message })
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Tautan masuk tidak berlaku'))
  }

  return ok(undefined)
}

/**
 * Redeems the token hash from one of our email templates. Unlike a PKCE code
 * it needs nothing from the browser that asked for the email, so the link
 * still works when it is opened on a phone.
 */
export async function verifyEmailLink(
  tokenHash: string,
  type: EmailLinkType,
): Promise<Result<void, AppError>> {
  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    logger.warn('auth.email_link_failed', { type, reason: error.message })
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Tautan email tidak berlaku'))
  }

  return ok(undefined)
}
