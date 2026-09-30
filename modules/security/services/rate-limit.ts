import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * Budgets for the endpoints that cost real money or real storage. They are
 * deliberately generous: this is abuse control, not a product limit. An OSIS
 * committee analysing five datasets in an afternoon should never notice them.
 */
export const RATE_LIMITS = {
  /** Parsing is cheap, but it reads the whole file into memory. */
  'dataset:preview': { limit: 60, windowSeconds: 3600 },
  /** Each upload writes rows and an object to storage. */
  'dataset:upload': { limit: 30, windowSeconds: 3600 },
  /** One run is one LLM call per batch — the expensive one. */
  'analysis:start': { limit: 20, windowSeconds: 3600 },
  /** Regenerating a summary is a paid call the user can press repeatedly. */
  'report:summary': { limit: 20, windowSeconds: 3600 },
  /** Each invitation can send an email from our domain; cap what one org can send. */
  'member:invite': { limit: 30, windowSeconds: 3600 },
  /** Renders every report as a PDF in one request — the heaviest thing a user can ask for. */
  'org:export': { limit: 5, windowSeconds: 3600 },
} as const

export type RateLimitAction = keyof typeof RATE_LIMITS

export type RateLimitVerdict = {
  remaining: number
  resetAt: Date
}

/**
 * Counts one request against `<action>:<scope>` and fails with RATE_LIMITED
 * when the budget is spent.
 *
 * The scope is the organization, not the user: the cost lands on the
 * organization's OpenAI bill, and a member who hits the ceiling by sharing an
 * account is the same problem as one who does it alone.
 *
 * A database that cannot be reached does **not** block the request. A limiter
 * that fails closed turns one outage into a second, larger one; the limit
 * exists to stop abuse, and abuse during a database outage is not the failure
 * mode worth optimising for. The miss is logged so it is visible.
 */
export async function enforceRateLimit(
  action: RateLimitAction,
  scope: string,
): Promise<Result<RateLimitVerdict, AppError>> {
  const { limit, windowSeconds } = RATE_LIMITS[action]
  const bucket = `${action}:${scope}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  const verdict = data?.[0]
  if (error || !verdict) {
    logger.warn('security.rate_limit.unavailable', { action })
    return ok({ remaining: limit, resetAt: new Date(Date.now() + windowSeconds * 1000) })
  }

  const resetAt = new Date(verdict.reset_at)

  if (!verdict.allowed) {
    logger.warn('security.rate_limit.exceeded', { action, limit })
    return err(
      appError(
        ERROR_CODES.RATE_LIMITED,
        'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
        { details: { retryAt: resetAt.toISOString() } },
      ),
    )
  }

  return ok({ remaining: verdict.remaining, resetAt })
}
