import type { ParsedSheet } from '../parsers'

/**
 * What a column's cells look like, worked out on the server so that guessing
 * its analysis mode needs no cell to leave it (ADR-0016). The header and these
 * figures are all the model is shown: a sheet's other columns are names,
 * classes and email addresses, and the guess is made before the uploader has
 * said which columns matter.
 */
export type ColumnProfile = {
  header: string
  kind: 'number' | 'short_text' | 'long_text' | 'date' | 'email' | 'phone' | 'empty'
  /** Cells that are not blank. */
  filled: number
  /** Different values among them, ignoring case and spacing. */
  distinct: number
  averageWords: number
}

/** A column "is" a kind when this share of its filled cells looks like it. */
const KIND_SHARE = 0.8
/** From here up the cells read as sentences rather than labels. */
const LONG_TEXT_WORDS = 4
/** Enough rows to judge a column by; a 5,000-row sheet is not read twice over. */
const PROFILE_ROWS = 500

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** "4", "4.5", "8,5", "4/5", "4 dari 5". */
const NUMBER = /^\d{1,6}(?:[.,]\d{1,2})?(?:\s*(?:\/|dari|per|of)\s*\d{1,6})?$/i
/** "2026-10-03", "3/10/2026 14:05:11", "03.10.26". */
const DATE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[ T]\d{1,2}[:.]\d{2}(?:[:.]\d{2})?.*)?$/

function isPhone(value: string): boolean {
  if (!/^\+?[\d\s\-().]+$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 9 && digits <= 15
}

function mostly(values: readonly string[], test: (value: string) => boolean): boolean {
  return values.filter(test).length >= values.length * KIND_SHARE
}

export function profileColumns(sheet: ParsedSheet): ColumnProfile[] {
  const rows = sheet.rows.slice(0, PROFILE_ROWS)

  return sheet.columns.map((header) => {
    const values = rows.map((row) => (row[header] ?? '').trim()).filter(Boolean)
    if (values.length === 0) {
      return { header, kind: 'empty', filled: 0, distinct: 0, averageWords: 0 }
    }

    const distinct = new Set(
      values.map((value) => value.toLowerCase().replace(/\s+/g, ' ')),
    ).size
    const words = values.reduce((sum, value) => sum + value.split(/\s+/).length, 0)
    const averageWords = Math.round((words / values.length) * 10) / 10

    // Dates before numbers: "3/10/2026" must not be read as a ratio.
    const kind = mostly(values, (value) => EMAIL.test(value))
      ? 'email'
      : mostly(values, (value) => DATE.test(value))
        ? 'date'
        : mostly(values, (value) => NUMBER.test(value))
          ? 'number'
          : mostly(values, isPhone)
            ? 'phone'
            : averageWords >= LONG_TEXT_WORDS
              ? 'long_text'
              : 'short_text'

    return { header, kind, filled: values.length, distinct, averageWords }
  })
}
