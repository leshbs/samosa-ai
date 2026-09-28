import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { DATASET_BUCKET, removeDatasetObject } from './dataset-storage'
import { parseCsv, parseXlsx } from '../parsers'
import { extractResponses, validateUploadSize } from '../validators/dataset-validator'
import { validateFileSignature, validateUploadFile } from '../validators/file-signature'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { DatasetSource } from '@/types/domain'

export type UploadDatasetInput = {
  organizationId: string
  uploaderId: string
  name: string
  source: DatasetSource
  textColumn: string
  /** Columns stored beside the text. Empty — the default — stores none. */
  keepColumns?: readonly string[]
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
  const nameCheck = validateUploadFile(input.file)
  if (!nameCheck.ok) return nameCheck

  const sizeCheck = validateUploadSize(input.file.size)
  if (!sizeCheck.ok) return sizeCheck

  const buffer = await input.file.arrayBuffer()

  // `source` arrives in the request body, so the bytes are the only honest
  // account of what was actually uploaded.
  const signatureCheck = validateFileSignature(buffer, input.source)
  if (!signatureCheck.ok) return signatureCheck

  const parsed =
    input.source === 'xlsx'
      ? parseXlsx(buffer)
      : parseCsv(new TextDecoder('utf-8').decode(buffer))
  if (!parsed.ok) return parsed

  const extracted = extractResponses(
    parsed.value,
    input.textColumn,
    input.keepColumns ?? [],
  )
  if (!extracted.ok) return extracted

  const supabase = createAdminClient()
  const storagePath = `${input.organizationId}/${crypto.randomUUID()}-${input.file.name}`

  const { error: uploadError } = await supabase.storage
    .from(DATASET_BUCKET)
    .upload(storagePath, buffer, { contentType: input.file.type, upsert: false })

  if (uploadError) {
    return err(appError(ERROR_CODES.INTERNAL, 'File yang diunggah tidak bisa disimpan'))
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
      metadata: {
        // Records which column the text came from, so a re-import is reproducible.
        text_column_name: input.textColumn,
        // And which columns were deliberately kept, so "what personal data does
        // this dataset hold" is answerable without opening the rows.
        kept_columns: [...(input.keepColumns ?? [])],
      },
    })
    .select('id')
    .single()

  if (datasetError || !dataset) {
    // The bytes are already in the bucket and no row will ever point at them.
    await removeDatasetObject(storagePath)
    return err(appError(ERROR_CODES.INTERNAL, 'Dataset tidak bisa dibuat'))
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
    // Leave no half-ingested dataset behind; the row cascade removes responses,
    // and the upload has to go with it or the file outlives everything that
    // referenced it.
    await supabase.from('datasets').delete().eq('id', datasetId)
    await removeDatasetObject(storagePath)
    return err(
      appError(ERROR_CODES.INTERNAL, 'Aspirasi dari dataset tidak bisa disimpan'),
    )
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
