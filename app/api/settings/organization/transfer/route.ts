import { getSessionUser, transferOwnership } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { transferOwnershipSchema } from '@/types/api'
import { sendOwnershipEmails } from '@/app/api/_lib/notify'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

/**
 * Hands the organization to another member (checklist 5.2). The dialog is the
 * first confirmation step; the typed name in the body is the second, and the
 * service checks it again. Both parties are emailed when email is on.
 */
export async function POST(request: Request) {
  const log = requestLog(request, 'POST /api/settings/organization/transfer')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const parsed = transferOwnershipSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Pilih penerima dan ketik nama organisasi', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const result = await transferOwnership(
    session.value,
    parsed.data.newOwnerId,
    parsed.data.confirmation,
  )
  if (!result.ok) return failure(result.error)

  const email = await sendOwnershipEmails({
    organizationName: session.value.organizationName,
    previousOwnerId: result.value.previousOwnerId,
    newOwnerId: result.value.newOwnerId,
  })
  log.info('api.ownership.transferred', { email })

  return success({ transferred: true, email })
}
