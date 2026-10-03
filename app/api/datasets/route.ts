import type { NextRequest } from 'next/server'
import { getSessionUser, can } from '@/modules/auth'
import { uploadDataset } from '@/modules/ingestion'
import { enforceRateLimit } from '@/modules/security'
import { ERROR_CODES, appError } from '@/modules/shared'
import { createDatasetSchema } from '@/types/api'
import { requestLog } from '@/app/api/_lib/request-log'
import { failure, success } from '@/app/api/_lib/respond'

/** A form field holding JSON; anything unreadable is left for the schema to refuse. */
function jsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

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

  // `columnModes` is the wizard's whole answer: every column and its mode, as
  // one JSON field. The two older forms are still honoured for a wizard that
  // was loaded before a deploy: one `textColumns` entry per question, and
  // before that a single `textColumn`.
  const textColumns = form.getAll('textColumns').filter((v) => typeof v === 'string')
  const legacy = form.get('textColumn')

  const parsed = createDatasetSchema.safeParse({
    name: form.get('name'),
    source: form.get('source'),
    textColumns:
      textColumns.length === 0 && typeof legacy === 'string' ? [legacy] : textColumns,
    columnModes: jsonField(form.get('columnModes')),
    modeDetection: jsonField(form.get('modeDetection')),
    // Repeated form field, one entry per column the uploader chose to keep.
    // `getAll` returns [] when the field is absent, which is the safe default.
    keepColumns: form.getAll('keepColumns').filter((v) => typeof v === 'string'),
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
    questionCount: result.value.questionCount,
  })
  return success(result.value, 201)
}
