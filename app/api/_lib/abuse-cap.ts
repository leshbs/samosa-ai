import { countResponsesSubmittedSince } from '@/modules/analysis'
import { getAccountScope } from '@/modules/auth'
import { getDataset } from '@/modules/ingestion'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * The monthly ceiling on responses sent to the model, per account (ADR-0012).
 *
 * This is an abuse limit, not a quota. It is never shown, never counted down
 * in the UI, and set far above what a school running honest surveys reaches;
 * an account with a real need gets it raised by hand in `accounts.limits`.
 * It exists so that one compromised or careless account cannot run up an
 * unbounded bill overnight.
 *
 * Counted across every workspace on the account, since that is who pays, and
 * per calendar month in UTC — the day the count resets does not need to be
 * anyone's local midnight.
 *
 * Fails open. A count that cannot be read must not stop a school from running
 * its analysis; the per-workspace rate limit is still in front of this.
 */
export async function checkMonthlyCap(
  organizationId: string,
  datasetId: string,
  now: Date = new Date(),
): Promise<Result<void, AppError>> {
  const scope = await getAccountScope(organizationId)
  const cap = scope?.limits.monthlyResponseCap ?? null
  if (!scope || cap === null) return ok(undefined)

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [used, dataset] = await Promise.all([
    countResponsesSubmittedSince(scope.organizationIds, monthStart),
    getDataset(organizationId, datasetId),
  ])
  if (used === null) return ok(undefined)

  // A dataset that cannot be read is createJob's error to report, not ours.
  const requested = dataset.ok ? dataset.value.responseCount : 0
  if (used + requested <= cap) return ok(undefined)

  logger.warn('analysis.monthly_cap.reached', {
    accountId: scope.accountId,
    used,
    requested,
    cap,
  })
  return err(
    appError(
      ERROR_CODES.RATE_LIMITED,
      'Akun ini sudah menganalisis jauh lebih banyak aspirasi dari biasanya bulan ini, jadi analisis baru ditahan dulu. Hubungi kami supaya batasnya dinaikkan.',
    ),
  )
}
