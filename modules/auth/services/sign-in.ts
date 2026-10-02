import 'server-only'

import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ORGANIZATION_NAME_METADATA_KEY } from '@/lib/supabase/user-metadata'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { ensureProfile, hasProfile } from './profile'
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

export type SignInOptions = {
  organizationName?: string
  /**
   * The person is on their way to an invitation. They join that organization
   * and nothing is created for them.
   */
  joining?: boolean
}

/**
 * Called by every entry point — OAuth callback, email link, password sign-in —
 * and decides whether this is a first arrival (ADR-0012):
 *
 *   - first arrival, no invitation: one workspace is created, without asking;
 *   - first arrival through an invitation: nothing is created;
 *   - every later sign-in: nothing is created. Someone whose workspace is gone
 *     — removed, left, deleted — gets the welcome page, not a new one.
 *
 * The profile row is what marks "has arrived", and it is written last, so a
 * first arrival that failed half-way is simply a first arrival again next time.
 * `organizationId` is null whenever nothing was created.
 */
export async function completeSignIn(
  options: SignInOptions = {},
): Promise<Result<{ organizationId: string | null }, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }
  const user = data.user

  if (await hasProfile(user.id)) return ok({ organizationId: null })

  if (options.joining) {
    await ensureProfile(user.id, user.user_metadata)
    return ok({ organizationId: null })
  }

  const provisioned = await provisionOrganization({
    userId: user.id,
    organizationName: organizationNameFor({
      explicit: options.organizationName,
      metadata: user.user_metadata?.[ORGANIZATION_NAME_METADATA_KEY],
      email: user.email ?? '',
    }),
  })

  // Other members need a name to show for this person even if they never open
  // their profile.
  if (provisioned.ok) await ensureProfile(user.id, user.user_metadata)
  return provisioned
}

/** An invitation link is the only `next` that means "joining, not starting". */
export function isJoining(next: string | null | undefined): boolean {
  return Boolean(next?.startsWith('/invite/'))
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
