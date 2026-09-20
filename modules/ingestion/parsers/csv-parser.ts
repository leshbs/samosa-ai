import Papa from 'papaparse'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { ParsedSheet } from './types'

/** Excel writes a BOM that would otherwise become part of the first header. */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
}

export function parseCsv(content: string): Result<ParsedSheet, AppError> {
  const parsed = Papa.parse<Record<string, string>>(stripBom(content), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })

  /**
   * Papaparse reports a one-column file as an undetectable delimiter, and a
   * ragged row as a field mismatch — both still parse, and a sheet that is
   * nothing but the aspiration column is exactly what we expect people to
   * upload. Only an unterminated quote means the text itself is unreadable.
   */
  const fatal = parsed.errors.filter((error) => error.type === 'Quotes')

  if (fatal.length > 0) {
    const first = fatal[0]
    return err(
      appError(ERROR_CODES.VALIDATION, 'CSV could not be parsed', {
        details: { row: first?.row, reason: first?.message },
      }),
    )
  }

  const columns = parsed.meta.fields ?? []
  if (columns.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'CSV has no header row'))
  }

  return ok({ columns, rows: parsed.data })
}
