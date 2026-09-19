import type { NextRequest } from 'next/server'
import { getSessionUser, can } from '@/modules/auth'
import { uploadDataset } from '@/modules/ingestion'
import { ERROR_CODES, appError } from '@/modules/shared'
import { createDatasetSchema } from '@/types/api'
import { failure, success } from '@/app/api/_lib/respond'

export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'dataset:create')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'You cannot upload datasets'))
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return failure(appError(ERROR_CODES.VALIDATION, 'A file is required'))
  }

  const parsed = createDatasetSchema.safeParse({
    name: form.get('name'),
    source: form.get('source'),
    textColumn: form.get('textColumn'),
  })
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Invalid dataset metadata', {
        details: { issues: parsed.error.flatten().fieldErrors },
      }),
    )
  }

  const result = await uploadDataset({
    organizationId: session.value.organizationId,
    uploaderId: session.value.userId,
    file,
    ...parsed.data,
  })

  return result.ok ? success(result.value, 201) : failure(result.error)
}
