import * as XLSX from 'xlsx'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { ParsedSheet, SheetRow } from './types'

/** Reads the first worksheet — Google Forms exports only ever have one. */
export function parseXlsx(buffer: ArrayBuffer): Result<ParsedSheet, AppError> {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch (cause) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Excel file could not be read', { cause }),
    )
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) {
    return err(appError(ERROR_CODES.VALIDATION, 'Excel file has no worksheet'))
  }

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '', raw: false })
  const columns = Object.keys(rows[0] ?? {}).map((column) => column.trim())

  if (columns.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'Excel worksheet has no header row'))
  }

  return ok({ columns, rows })
}
