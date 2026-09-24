import type { NextRequest } from 'next/server'
import { getSessionUser, can } from '@/modules/auth'
import { uploadDataset } from '@/modules/ingestion'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError } from '@/modules/shared'
import { createDatasetSchema } from '@/types/api'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

export async function POST(request: NextRequest) {
  const log = requestLog(request, 'POST /api/datasets')

  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)
  if (!can(session.value.role, 'dataset:create')) {
    return failure(appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengunggah dataset'))
  }

  // Before the body is read: a rejected request should not cost us the time
  // and memory of buffering a 10 MB file.
  const budget = await enforceRateLimit('dataset:upload', session.value.organizationId)
  if (!budget.ok) return failure(budget.error)

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return failure(appError(ERROR_CODES.VALIDATION, 'File wajib dipilih'))
  }

  const parsed = createDatasetSchema.safeParse({
    name: form.get('name'),
    source: form.get('source'),
    textColumn: form.get('textColumn'),
  })
  if (!parsed.success) {
    return failure(
      appError(ERROR_CODES.VALIDATION, 'Data dataset tidak valid', {
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

  if (!result.ok) {
    log.warn('api.dataset.upload_failed', { code: result.error.code })
    return failure(result.error)
  }

  log.info('api.dataset.uploaded', {
    datasetId: result.value.datasetId,
    responseCount: result.value.responseCount,
  })
  return success(result.value, 201)
}
