import { z } from 'zod'
import { createWorkspace } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({ name: z.string().trim().min(2).max(120) })

/**
 * Starts a workspace the caller will own, and switches them into it. The
 * service authenticates the caller and checks how many their plan allows.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Nama ruang kerja harus 2 sampai 120 karakter'),
    )
  }

  const result = await createWorkspace(parsed.data.name)
  return result.ok ? success(result.value, 201) : failure(result.error)
}
