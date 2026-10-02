import { z } from 'zod'
import { leaveWorkspace } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({ organizationId: z.string().uuid() })

/**
 * The caller leaves a workspace they do not own. Which workspace is named
 * explicitly rather than taken from the active one: the profile page lists
 * them all, and "leave" must never land on whichever happened to be open.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'ID ruang kerja tidak valid'))
  }

  const result = await leaveWorkspace(parsed.data.organizationId)
  return result.ok ? success({ left: true }) : failure(result.error)
}
