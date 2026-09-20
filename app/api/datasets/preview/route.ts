import type { NextRequest } from 'next/server'
import { can, getSessionUser } from '@/modules/auth'
import { previewDataset } from '@/modules/ingestion'
import { ERROR_CODES, appError } from '@/modules/shared'
import { datasetSourceSchema } from '@/types/domain'
import { failure, success } from '@/app/api/_lib/respond'

/**
 * Step 2 of the upload wizard: parse the sheet and hand back its headers so the
 * uploader can pick the aspiration column. Nothing is stored — the same file is
 * posted again to POST /api/datasets once the column is chosen.
 */
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

  const source = datasetSourceSchema.safeParse(form.get('source'))
  if (!source.success) {
    return failure(appError(ERROR_CODES.VALIDATION, 'Unsupported file type'))
  }

  const result = await previewDataset(file, source.data)
  return result.ok ? success(result.value) : failure(result.error)
}
