import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { completeSignIn } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({
  organizationName: z.string().trim().min(1).max(120).optional(),
})

/**
 * Makes sure the signed-in caller has an organization. Signup sends the name
 * it collected; password sign-in sends nothing and gets the name stored at
 * signup, which repairs an account whose confirmation link never provisioned.
 * The service authenticates the caller and only ever provisions for itself.
 */
export async function POST(request: NextRequest) {
  const raw: unknown = await request.json().catch(() => ({}))
  const body = bodySchema.safeParse(raw ?? {})
  if (!body.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Nama organisasi tidak valid'))
  }

  const result = await completeSignIn(body.data.organizationName)
  return result.ok ? success(result.value, 201) : failure(result.error)
}
