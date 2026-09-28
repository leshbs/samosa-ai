import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parseXlsx } from '@/modules/ingestion/parsers/xlsx-parser'

/** Builds a real workbook so the test exercises the same bytes a user uploads. */
function workbookOf(
  rows: Array<Record<string, string>>,
  sheetName = 'Sheet1',
): ArrayBuffer {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheetName)
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseXlsx', () => {
  it('reads headers and rows from the first worksheet', () => {
    const buffer = workbookOf([
      { Nama: 'Rina', Aspirasi: 'Kantin kurang bersih' },
      { Nama: 'Bayu', Aspirasi: 'Wifi perpustakaan lambat' },
    ])

    const result = parseXlsx(buffer)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.columns).toEqual(['Nama', 'Aspirasi'])
    expect(result.value.rows).toHaveLength(2)
    expect(result.value.rows[1]?.Aspirasi).toBe('Wifi perpustakaan lambat')
  })

  it('keeps unicode intact', () => {
    const result = parseXlsx(workbookOf([{ Aspirasi: 'Acara seru 🎉 — lanjutkan!' }]))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows[0]?.Aspirasi).toBe('Acara seru 🎉 — lanjutkan!')
  })

  it('reads numeric cells as strings so downstream code never sees a number', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Kelas', 'Aspirasi'],
        [11, 'Perlu lebih banyak kursi'],
      ]),
      'Sheet1',
    )
    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const result = parseXlsx(buffer)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows[0]?.Kelas).toBe('11')
  })

  it('handles a thousand rows', () => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      Aspirasi: `Aspirasi ke-${index}`,
    }))

    const result = parseXlsx(workbookOf(rows))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows).toHaveLength(1000)
  })

  it('rejects a worksheet with no header row', () => {
    const result = parseXlsx(workbookOf([]))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('rejects bytes that are not a workbook at all', () => {
    const result = parseXlsx(new TextEncoder().encode('not a workbook').buffer)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })
})
