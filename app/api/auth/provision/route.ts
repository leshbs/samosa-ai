import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, provisionOrganization } from '@/modules/auth'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

const bodySchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
})

/**
 * Called right after signup. The organization is created with the service role,
 * so the caller is authenticated here first and may only provision for itself.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user.ok) return failure(user.error)

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'An organization name is required'))
  }

  const result = await provisionOrganization({
    userId: user.value.userId,
    organizationName: body.data.organizationName,
  })

  return result.ok ? success(result.value, 201) : failure(result.error)
}
