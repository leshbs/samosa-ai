// @vitest-environment node
// jsdom's File has no arrayBuffer(), which previewDataset needs.
import { describe, expect, it } from 'vitest'
import {
  PREVIEW_ROW_COUNT,
  previewDataset,
} from '@/modules/ingestion/services/preview-dataset'

function csvFile(content: string, name = 'aspirasi.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

describe('previewDataset', () => {
  it('returns headers and a capped sample of rows', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => `${index},Aspirasi ${index}`)
    const result = await previewDataset(
      csvFile(['No,Aspirasi', ...rows].join('\n')),
      'csv',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.columns).toEqual(['No', 'Aspirasi'])
    expect(result.value.totalRows).toBe(20)
    expect(result.value.sampleRows).toHaveLength(PREVIEW_ROW_COUNT)
  })

  it('suggests the column whose header names an aspiration', async () => {
    const result = await previewDataset(
      csvFile(
        'Timestamp,Nama,Saran untuk OSIS\n2026-01-02,Rina,Perbanyak kegiatan olahraga',
      ),
      'csv',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.suggestedColumn).toBe('Saran untuk OSIS')
  })

  it('falls back to the wordiest column when no header matches', async () => {
    const result = await previewDataset(
      csvFile(
        [
          'Timestamp,Kelas,Catatan',
          '2026-01-02,XI-2,Perpustakaan perlu AC dan kursi tambahan supaya nyaman dipakai belajar',
          '2026-01-03,XII-1,Jadwal ekstrakurikuler bentrok dengan jam pelajaran tambahan sore',
        ].join('\n'),
      ),
      'csv',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.suggestedColumn).toBe('Catatan')
  })

  it('rejects a file with headers but no data rows', async () => {
    const result = await previewDataset(csvFile('Timestamp,Aspirasi\n'), 'csv')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION')
  })

  it('rejects an empty file before parsing it', async () => {
    const result = await previewDataset(csvFile(''), 'csv')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('empty')
  })
})
