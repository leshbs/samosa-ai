import { parseCsv, parseXlsx } from '../parsers'
import { validateUploadSize } from '../validators/dataset-validator'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { DatasetSource } from '@/types/domain'

/** Enough rows for the uploader to recognise the right column, not a data dump. */
export const PREVIEW_ROW_COUNT = 5

export type DatasetPreview = {
  columns: string[]
  sampleRows: Array<Record<string, string>>
  totalRows: number
  /** Best guess at the aspiration column, pre-selected in the wizard. */
  suggestedColumn: string | null
}

/** Headers a Google Forms aspiration column tends to use. */
const COLUMN_HINTS = [
  'aspirasi',
  'masukan',
  'saran',
  'kritik',
  'feedback',
  'pendapat',
  'komentar',
]

function suggestColumn(
  columns: string[],
  rows: Array<Record<string, string>>,
): string | null {
  const byName = columns.find((column) =>
    COLUMN_HINTS.some((hint) => column.toLowerCase().includes(hint)),
  )
  if (byName) return byName

  // Otherwise take the wordiest column — free text beats timestamps and ids.
  let best: { column: string; length: number } | null = null
  for (const column of columns) {
    const total = rows.reduce((sum, row) => sum + (row[column] ?? '').length, 0)
    const average = rows.length > 0 ? total / rows.length : 0
    if (!best || average > best.length) best = { column, length: average }
  }

  return best && best.length > 0 ? best.column : (columns[0] ?? null)
}

export async function previewDataset(
  file: File,
  source: DatasetSource,
): Promise<Result<DatasetPreview, AppError>> {
  const sizeCheck = validateUploadSize(file.size)
  if (!sizeCheck.ok) return sizeCheck

  const buffer = await file.arrayBuffer()
  const parsed =
    source === 'xlsx'
      ? parseXlsx(buffer)
      : parseCsv(new TextDecoder('utf-8').decode(buffer))
  if (!parsed.ok) return parsed

  if (parsed.value.rows.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'File has no data rows'))
  }

  const sampleRows = parsed.value.rows.slice(0, PREVIEW_ROW_COUNT)

  return ok({
    columns: parsed.value.columns,
    sampleRows,
    totalRows: parsed.value.rows.length,
    suggestedColumn: suggestColumn(parsed.value.columns, sampleRows),
  })
}
