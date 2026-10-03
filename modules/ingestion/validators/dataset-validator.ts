import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { MAX_RESPONSE_LENGTH, MAX_UPLOAD_BYTES } from '@/types/api'
import type { ParsedSheet } from '../parsers'

/**
 * Only a blank cell is not a response. "-", "ga" and "." are respondents who
 * answered "nothing" — they are kept so the report can count them ("128 dari
 * 140 responden memberikan aspirasi"), and the analysis batcher keeps them
 * away from the model. Dropping them here used to make them vanish from both.
 */
const MIN_RESPONSE_LENGTH = 1
/**
 * Answers, not respondents: 1,000 people answering five questions is 5,000.
 * The cap is on what a job has to send to the model.
 */
const MAX_RESPONSES_PER_DATASET = 5_000
/** A report section each; past this a survey is not one report any more. */
export const MAX_QUESTIONS_PER_DATASET = 10

export type ExtractedResponse = {
  /** The header of the column this answer came from. */
  column: string
  /** The sheet row, counted from 0: the same on every answer of one respondent. */
  respondentIndex: number
  text: string
  respondentMeta: Record<string, string>
}

export type ExtractionReport = {
  /** The text columns, in sheet order, that had at least one answer. */
  columns: string[]
  responses: ExtractedResponse[]
  /** Sheet rows with at least one answer. */
  respondentCount: number
  /** Blank cells in the chosen columns. */
  skippedEmpty: number
  truncated: number
}

export function validateUploadSize(bytes: number): Result<void, AppError> {
  if (bytes <= 0) return err(appError(ERROR_CODES.VALIDATION, 'File kosong'))
  if (bytes > MAX_UPLOAD_BYTES) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Ukuran file melebihi batas 10 MB', {
        details: { bytes, limit: MAX_UPLOAD_BYTES },
      }),
    )
  }
  return ok(undefined)
}

/**
 * Pulls the answer columns out of a parsed sheet: one response per respondent
 * per question they answered. A blank cell is not a response, so a respondent
 * who skipped a question simply has no row for it.
 *
 * Every other column is **dropped** unless it is named in `keepColumns`. That
 * default is the point of this function, not a detail of it: a Google Forms
 * export of student aspirations carries names, classes and email addresses in
 * the columns beside the text, and the analysis pipeline never needs any of
 * them. Keeping them by default meant every dataset stored identifiable data
 * about minors in exchange for nothing.
 *
 * Opting a column back in is a deliberate act in the upload wizard, so the
 * stored metadata is always something a person chose to keep.
 */
export function extractResponses(
  sheet: ParsedSheet,
  textColumns: readonly string[],
  keepColumns: readonly string[] = [],
): Result<ExtractionReport, AppError> {
  const missing = textColumns.find((column) => !sheet.columns.includes(column))
  if (textColumns.length === 0 || missing !== undefined) {
    return err(
      appError(ERROR_CODES.VALIDATION, `Kolom "${missing ?? ''}" tidak ada di file ini`, {
        details: { available: sheet.columns },
      }),
    )
  }
  if (textColumns.length > MAX_QUESTIONS_PER_DATASET) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        `Paling banyak ${MAX_QUESTIONS_PER_DATASET} pertanyaan per dataset`,
        { details: { found: textColumns.length, limit: MAX_QUESTIONS_PER_DATASET } },
      ),
    )
  }

  // Sheet order, each once: the order the questions appear in the report must
  // not depend on the order the request happened to list them.
  const questions = sheet.columns.filter((column) => textColumns.includes(column))

  // Resolved once, and only from columns the sheet actually has: a stale name
  // in the request must not become an empty key on every row.
  const kept = sheet.columns.filter(
    (column) => !questions.includes(column) && keepColumns.includes(column),
  )

  const responses: ExtractedResponse[] = []
  const answered = new Set<string>()
  let respondentCount = 0
  let skippedEmpty = 0
  let truncated = 0

  sheet.rows.forEach((row, respondentIndex) => {
    let respondentMeta: Record<string, string> | null = null

    for (const column of questions) {
      const raw = (row[column] ?? '').trim()
      if (raw.length < MIN_RESPONSE_LENGTH) {
        skippedEmpty += 1
        continue
      }

      if (raw.length > MAX_RESPONSE_LENGTH) truncated += 1

      if (respondentMeta === null) {
        respondentMeta = {}
        for (const keptColumn of kept) {
          const value = row[keptColumn]
          if (value) respondentMeta[keptColumn] = value
        }
        respondentCount += 1
      }

      answered.add(column)
      responses.push({
        column,
        respondentIndex,
        text: raw.slice(0, MAX_RESPONSE_LENGTH),
        respondentMeta,
      })
    }
  })

  if (responses.length === 0) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Tidak ada aspirasi yang bisa dipakai di file ini',
      ),
    )
  }
  if (responses.length > MAX_RESPONSES_PER_DATASET) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        questions.length > 1
          ? 'Dataset melebihi batas 5.000 jawaban (responden × pertanyaan). Kurangi pertanyaan yang dipilih.'
          : 'Dataset melebihi batas 5.000 aspirasi',
        { details: { found: responses.length, limit: MAX_RESPONSES_PER_DATASET } },
      ),
    )
  }

  return ok({
    // A chosen column nobody answered is not a question of this dataset: it
    // would be a report section with nothing in it.
    columns: questions.filter((column) => answered.has(column)),
    responses,
    respondentCount,
    skippedEmpty,
    truncated,
  })
}
