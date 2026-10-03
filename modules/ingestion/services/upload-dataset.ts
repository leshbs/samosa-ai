import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { DATASET_BUCKET, removeDatasetObject } from './dataset-storage'
import { parseCsv, parseXlsx } from '../parsers'
import { extractResponses, validateUploadSize } from '../validators/dataset-validator'
import { validateFileSignature, validateUploadFile } from '../validators/file-signature'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  isQuestionMode,
  type AnalysisMode,
  type DatasetSource,
  type QuestionMode,
} from '@/types/domain'

/** What the wizard decided about one column of the sheet. */
export type ColumnModeChoice = {
  column: string
  /** What the uploader settled on. */
  mode: AnalysisMode
  /** What the system guessed before that; null when it made no guess. */
  detectedMode: AnalysisMode | null
}

export type UploadDatasetInput = {
  organizationId: string
  uploaderId: string
  name: string
  source: DatasetSource
  /**
   * The open questions: each column becomes a question of the dataset, read as
   * `evaluative`. The form this took before modes; `columnModes` replaces it.
   */
  textColumns?: readonly string[]
  /**
   * Every column the wizard showed, with its mode. The columns given one of
   * the four question modes become the dataset's questions; the rest are not
   * stored. Kept whole in the dataset's metadata, so how often a guess was
   * overruled can be counted later (pilot 01, §4.2).
   */
  columnModes?: readonly ColumnModeChoice[]
  /** Which prompt made the guesses; null when they came from the rules. */
  modeDetection?: { promptVersion: string | null; modelId: string | null }
  /** Columns stored beside the text. Empty — the default — stores none. */
  keepColumns?: readonly string[]
  file: File
}

export type UploadDatasetOutput = {
  datasetId: string
  /** Answers stored: one per respondent per question they answered. */
  responseCount: number
  respondentCount: number
  questionCount: number
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

  const choices = input.columnModes ?? []
  const chosen = new Map(choices.map((choice) => [choice.column, choice]))
  /** A column named only by `textColumns` is what every column once was. */
  const modeOf = (column: string): QuestionMode => {
    const mode = chosen.get(column)?.mode
    return isQuestionMode(mode) ? mode : 'evaluative'
  }
  const textColumns =
    choices.length > 0
      ? choices.filter((choice) => isQuestionMode(choice.mode)).map((c) => c.column)
      : (input.textColumns ?? [])

  if (textColumns.length === 0) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Pilih paling tidak satu kolom untuk dianalisis'),
    )
  }

  const extracted = extractResponses(parsed.value, textColumns, input.keepColumns ?? [])
  if (!extracted.ok) return extracted
  const { columns } = extracted.value

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
        // The questions table is the full account; this is its first entry, kept
        // for what still reads one name.
        text_column_name: columns[0] ?? '',
        // Sheet rows with at least one answer: with several questions it is no
        // longer the number of stored rows.
        respondent_count: extracted.value.respondentCount,
        // And which columns were deliberately kept, so "what personal data does
        // this dataset hold" is answerable without opening the rows.
        kept_columns: [...(input.keepColumns ?? [])],
        // Every column the wizard showed, what the system guessed and what the
        // uploader chose — including the columns that were not kept, which is
        // the half of "was the guess right" the questions table cannot hold.
        // Headers only, never a cell.
        ...(choices.length > 0
          ? {
              column_modes: choices.map((choice) => ({
                column: choice.column.slice(0, 200),
                detected: choice.detectedMode,
                chosen: choice.mode,
              })),
              mode_detection: {
                prompt_version: input.modeDetection?.promptVersion ?? null,
                model_id: input.modeDetection?.modelId ?? null,
              },
            }
          : {}),
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

  /** Removes everything this upload stored; the row cascade takes the rest. */
  const undo = async () => {
    await supabase.from('datasets').delete().eq('id', datasetId)
    await removeDatasetObject(storagePath)
  }

  // The header is the question until someone rewords it: it is what the
  // respondent was asked, and what the report prints over the section.
  const { data: questions, error: questionsError } = await supabase
    .from('dataset_questions')
    .insert(
      columns.map((column, position) => ({
        dataset_id: datasetId,
        organization_id: input.organizationId,
        column_name: column.slice(0, 200),
        question_text: column.slice(0, 500),
        analysis_mode: modeOf(column),
        detected_mode: chosen.get(column)?.detectedMode ?? null,
        position,
      })),
    )
    .select('id, position')

  if (questionsError || !questions || questions.length !== columns.length) {
    await undo()
    return err(appError(ERROR_CODES.INTERNAL, 'Pertanyaan dataset tidak bisa disimpan'))
  }

  const questionIdOf = new Map(
    questions.map((row) => [columns[Number(row.position)], String(row.id)]),
  )

  const { error: responsesError } = await supabase.from('responses').insert(
    extracted.value.responses.map((response) => ({
      dataset_id: datasetId,
      organization_id: input.organizationId,
      question_id: questionIdOf.get(response.column),
      respondent_index: response.respondentIndex,
      text: response.text,
      respondent_meta: response.respondentMeta,
    })),
  )

  if (responsesError) {
    // Leave no half-ingested dataset behind; the row cascade removes responses,
    // and the upload has to go with it or the file outlives everything that
    // referenced it.
    await undo()
    return err(
      appError(ERROR_CODES.INTERNAL, 'Aspirasi dari dataset tidak bisa disimpan'),
    )
  }

  logger.info('ingestion.dataset.created', {
    datasetId,
    responseCount: extracted.value.responses.length,
    respondentCount: extracted.value.respondentCount,
    questionCount: columns.length,
    skippedEmpty: extracted.value.skippedEmpty,
  })

  return ok({
    datasetId,
    responseCount: extracted.value.responses.length,
    respondentCount: extracted.value.respondentCount,
    questionCount: columns.length,
    skippedEmpty: extracted.value.skippedEmpty,
  })
}
