import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { parseCsv, parseXlsx } from '../parsers'
import { extractResponses, validateUploadSize } from '../validators/dataset-validator'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { DatasetSource } from '@/types/domain'

const DATASET_BUCKET = 'datasets'

export type UploadDatasetInput = {
  organizationId: string
  uploaderId: string
  name: string
  source: DatasetSource
  textColumn: string
  file: File
}

export type UploadDatasetOutput = {
  datasetId: string
  responseCount: number
  skippedEmpty: number
}

export async function uploadDataset(
  input: UploadDatasetInput,
): Promise<Result<UploadDatasetOutput, AppError>> {
  const sizeCheck = validateUploadSize(input.file.size)
  if (!sizeCheck.ok) return sizeCheck

  const buffer = await input.file.arrayBuffer()
  const parsed =
    input.source === 'xlsx'
      ? parseXlsx(buffer)
      : parseCsv(new TextDecoder('utf-8').decode(buffer))
  if (!parsed.ok) return parsed

  const extracted = extractResponses(parsed.value, input.textColumn)
  if (!extracted.ok) return extracted

  const supabase = createAdminClient()
  const storagePath = `${input.organizationId}/${crypto.randomUUID()}-${input.file.name}`

  const { error: uploadError } = await supabase.storage
    .from(DATASET_BUCKET)
    .upload(storagePath, buffer, { contentType: input.file.type, upsert: false })

  if (uploadError) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not store the uploaded file'))
  }

  const { data: dataset, error: datasetError } = await supabase
    .from('datasets')
    .insert({
      organization_id: input.organizationId,
      uploader_id: input.uploaderId,
      name: input.name,
      source: input.source,
      storage_path: storagePath,
      response_count: extracted.value.responses.length,
    })
    .select('id')
    .single()

  if (datasetError || !dataset) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not create the dataset record'))
  }

  const datasetId = String(dataset.id)
  const { error: responsesError } = await supabase.from('responses').insert(
    extracted.value.responses.map((response) => ({
      dataset_id: datasetId,
      organization_id: input.organizationId,
      text: response.text,
      respondent_meta: response.respondentMeta,
    })),
  )

  if (responsesError) {
    // Leave no half-ingested dataset behind; the row cascade removes responses.
    await supabase.from('datasets').delete().eq('id', datasetId)
    return err(appError(ERROR_CODES.INTERNAL, 'Could not store dataset responses'))
  }

  logger.info('ingestion.dataset.created', {
    datasetId,
    responseCount: extracted.value.responses.length,
    skippedEmpty: extracted.value.skippedEmpty,
  })

  return ok({
    datasetId,
    responseCount: extracted.value.responses.length,
    skippedEmpty: extracted.value.skippedEmpty,
  })
}
