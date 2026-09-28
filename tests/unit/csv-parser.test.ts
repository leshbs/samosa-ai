import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/modules/ingestion/parsers/csv-parser'

describe('parseCsv', () => {
  it('parses a Google Forms style export', () => {
    const result = parseCsv(
      'Timestamp,Nama,Aspirasi\n2026-01-02,Rina,Kantin kurang bersih',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.columns).toEqual(['Timestamp', 'Nama', 'Aspirasi'])
    expect(result.value.rows).toHaveLength(1)
    expect(result.value.rows[0]?.Aspirasi).toBe('Kantin kurang bersih')
  })

  it('strips the BOM Excel writes, which would corrupt the first header', () => {
    const result = parseCsv('﻿Aspirasi\nPerpustakaan perlu AC')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.columns).toEqual(['Aspirasi'])
  })

  it('trims padded headers so column lookup matches what the user picked', () => {
    const result = parseCsv('  Aspirasi  ,Kelas\nBagus,XI-2')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.columns).toEqual(['Aspirasi', 'Kelas'])
  })

  it('drops blank lines rather than emitting empty responses', () => {
    const result = parseCsv('Aspirasi\nSatu\n\n\nDua\n')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows).toHaveLength(2)
  })

  it('keeps unicode and emoji intact', () => {
    const result = parseCsv(
      'Aspirasi\n"Kegiatan seru 🎉, mohon diulang ya — terima kasih"',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows[0]?.Aspirasi).toBe(
      'Kegiatan seru 🎉, mohon diulang ya — terima kasih',
    )
  })

  it('handles a thousand rows', () => {
    const rows = Array.from({ length: 1000 }, (_, index) => `Aspirasi ke-${index}`)
    const result = parseCsv(['Aspirasi', ...rows].join('\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows).toHaveLength(1000)
    expect(result.value.rows[999]?.Aspirasi).toBe('Aspirasi ke-999')
  })

  it('rejects a file with no header row', () => {
    const result = parseCsv('')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })
})
