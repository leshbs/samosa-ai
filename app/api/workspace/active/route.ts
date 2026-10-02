import { z } from 'zod'
import { setActiveWorkspace } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({ organizationId: z.string().uuid() })

/**
 * Switches which of the caller's workspaces the following requests are about.
 * The service checks membership; a workspace the caller is not in is a 404.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'ID ruang kerja tidak valid'))
  }

  const result = await setActiveWorkspace(parsed.data.organizationId)
  return result.ok ? success(result.value) : failure(result.error)
}
