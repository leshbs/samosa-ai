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
  if (bytes <= 0) return err(appError(ERROR_CODES.VALIDATION, 'File is empty'))
  if (bytes > MAX_UPLOAD_BYTES) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'File exceeds the 10 MB upload limit', {
        details: { bytes, limit: MAX_UPLOAD_BYTES },
      }),
    )
  }
  return ok(undefined)
}

/**
 * Pulls the aspiration column out of a parsed sheet and keeps the remaining
 * columns as respondent metadata (never logged, never sent to the model).
 */
export function extractResponses(
  sheet: ParsedSheet,
  textColumn: string,
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
    for (const column of sheet.columns) {
      if (column === textColumn) continue
      const value = row[column]
      if (value) respondentMeta[column] = value
    }

    responses.push({ text: raw.slice(0, MAX_RESPONSE_LENGTH), respondentMeta })
  }

  if (responses.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'No usable responses found in the file'))
  }
  if (responses.length > MAX_RESPONSES_PER_DATASET) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Dataset exceeds the 5000-response limit', {
        details: { found: responses.length, limit: MAX_RESPONSES_PER_DATASET },
      }),
    )
  }

  return ok({ responses, skippedEmpty, truncated })
}
