import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/modules/ingestion/parsers/csv-parser'
import {
  extractResponses,
  validateUploadSize,
} from '@/modules/ingestion/validators/dataset-validator'
import { MAX_UPLOAD_BYTES } from '@/types/api'

const CSV = `Timestamp,Kelas,Aspirasi
2026-01-02,XII IPA 1,Konsumsi telat sekali
2026-01-02,XI IPS 2,
2026-01-02,X MIPA 3,Acaranya seru banget`

describe('validateUploadSize', () => {
  it('rejects an empty file', () => {
    expect(validateUploadSize(0).ok).toBe(false)
  })

  it('rejects a file above the upload limit', () => {
    expect(validateUploadSize(MAX_UPLOAD_BYTES + 1).ok).toBe(false)
  })

  it('accepts a file within the limit', () => {
    expect(validateUploadSize(1024).ok).toBe(true)
  })
})

describe('parseCsv', () => {
  it('reads headers and rows', () => {
    const parsed = parseCsv(CSV)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.columns).toEqual(['Timestamp', 'Kelas', 'Aspirasi'])
    expect(parsed.value.rows).toHaveLength(3)
  })

  it('strips a UTF-8 BOM from the first header', () => {
    const parsed = parseCsv(`﻿${CSV}`)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.columns[0]).toBe('Timestamp')
  })
})

describe('extractResponses', () => {
  it('keeps non-text columns as respondent metadata', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Aspirasi')
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return
    expect(extracted.value.responses).toHaveLength(2)
    expect(extracted.value.skippedEmpty).toBe(1)
    expect(extracted.value.responses[0]?.respondentMeta).toMatchObject({
      Kelas: 'XII IPA 1',
    })
  })

  it('fails when the text column is missing', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Tidak Ada')
    expect(extracted.ok).toBe(false)
  })
})
