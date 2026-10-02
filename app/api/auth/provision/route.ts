import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { completeSignIn } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({
  organizationName: z.string().trim().min(1).max(120).optional(),
  joining: z.boolean().optional(),
})

/**
 * Finishes a sign-in. On a first arrival that means one workspace, under the
 * name signup collected — or none, when the caller is on their way to an
 * invitation (`joining`). On any later sign-in it creates nothing. The service
 * authenticates the caller and only ever provisions for itself.
 *
 * `joining` comes from the browser and is safe to trust: all it can do is
 * *withhold* a workspace, which the welcome page offers again.
 */
export async function POST(request: NextRequest) {
  const raw: unknown = await request.json().catch(() => ({}))
  const body = bodySchema.safeParse(raw ?? {})
  if (!body.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Nama ruang kerja tidak valid'))
  }

  const result = await completeSignIn(body.data)
  return result.ok ? success(result.value) : failure(result.error)
}
