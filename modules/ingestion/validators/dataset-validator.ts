import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { MAX_RESPONSE_LENGTH, MAX_UPLOAD_BYTES } from '@/types/api'
import type { ParsedSheet } from '../parsers'

/** Below this a "response" is punctuation or a stray keystroke, not an opinion. */
const MIN_RESPONSE_LENGTH = 3
const MAX_RESPONSES_PER_DATASET = 5_000

export type ExtractedResponse = {
  text: string
  respondentMeta: Record<string, string>
}

export type ExtractionReport = {
  responses: ExtractedResponse[]
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
 * Pulls the aspiration column out of a parsed sheet.
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
  textColumn: string,
  keepColumns: readonly string[] = [],
): Result<ExtractionReport, AppError> {
  if (!sheet.columns.includes(textColumn)) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        `Column "${textColumn}" was not found in the file`,
        {
          details: { available: sheet.columns },
        },
      ),
    )
  }

  // Resolved once, and only from columns the sheet actually has: a stale name
  // in the request must not become an empty key on every row.
  const kept = sheet.columns.filter(
    (column) => column !== textColumn && keepColumns.includes(column),
  )

  const responses: ExtractedResponse[] = []
  let skippedEmpty = 0
  let truncated = 0

  for (const row of sheet.rows) {
    const raw = (row[textColumn] ?? '').trim()
    if (raw.length < MIN_RESPONSE_LENGTH) {
      skippedEmpty += 1
      continue
    }

    if (raw.length > MAX_RESPONSE_LENGTH) truncated += 1

    const respondentMeta: Record<string, string> = {}
    for (const column of kept) {
      const value = row[column]
      if (value) respondentMeta[column] = value
    }

    responses.push({ text: raw.slice(0, MAX_RESPONSE_LENGTH), respondentMeta })
  }

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
      appError(ERROR_CODES.VALIDATION, 'Dataset melebihi batas 5.000 aspirasi', {
        details: { found: responses.length, limit: MAX_RESPONSES_PER_DATASET },
      }),
    )
  }

  return ok({ responses, skippedEmpty, truncated })
}
