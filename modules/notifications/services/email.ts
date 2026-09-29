import 'server-only'

import { serverEnv } from '@/lib/env'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * Transactional email through Resend's HTTP API.
 *
 * A plain fetch rather than the SDK: one endpoint, one payload, and nothing
 * else in the app needs it. Resend is the same account docs/auth-setup.md sets
 * up as Supabase's SMTP, so turning email on is one domain, not two vendors.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
/** An email that takes longer than this is not worth holding a function for. */
const SEND_TIMEOUT_MS = 10_000

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Both variables or neither. The UI asks this before promising an email, so a
 * deployment without a sending domain says "email is off" instead of lying.
 */
export function isEmailConfigured(): boolean {
  const env = serverEnv()
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

/**
 * Sends one message. Never throws. Every caller treats email as a side effect
 * of something that already succeeded — a job finished, an invitation exists —
 * so a failure here is logged and reported, never allowed to undo that.
 *
 * The recipient is never logged: an address is PII, and the kind of email plus
 * the request id are enough to find the attempt.
 */
export async function sendEmail(
  message: EmailMessage,
  kind: string,
): Promise<Result<{ id: string }, AppError>> {
  const env = serverEnv()
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('notifications.email.skipped', { kind, reason: 'not_configured' })
    return err(appError(ERROR_CODES.UPSTREAM, 'Pengiriman email belum diaktifkan'))
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })

    if (!response.ok) {
      logger.warn('notifications.email.rejected', { kind, status: response.status })
      return err(appError(ERROR_CODES.UPSTREAM, 'Email tidak terkirim'))
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown } | null
    logger.info('notifications.email.sent', { kind })
    return ok({ id: typeof body?.id === 'string' ? body.id : '' })
  } catch (cause) {
    logger.warn('notifications.email.failed', { kind, cause: String(cause) })
    return err(appError(ERROR_CODES.UPSTREAM, 'Email tidak terkirim', { cause }))
  }
}
