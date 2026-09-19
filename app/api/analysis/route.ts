import type { NextRequest } from 'next/server'
import { can, getSessionUser } from '@/modules/auth'
import { createJob } from '@/modules/analysis'
import { ERROR_CODES, appError } from '@/modules/shared'
import { createAnalysisSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'analysis:run')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot start analyses'))
  }

  const parsed = createAnalysisSchema.safeParse(await request.json())
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Invalid analysis request', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const result = await createJob({
    organizationId: session.value.organizationId,
    datasetId: parsed.data.datasetId,
    promptVersion: parsed.data.promptVersion,
  })

  return result.ok
    ? success({ jobId: result.value.id, status: result.value.status }, 202)
    : failure(result.error)
}
