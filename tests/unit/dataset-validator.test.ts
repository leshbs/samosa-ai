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
  /**
   * The default used to be the opposite — every non-text column was kept — so a
   * Google Forms export stored names and classes about minors that nothing in
   * the pipeline ever read. These cases pin the inversion in place.
   */
  it('drops every non-text column by default', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Aspirasi')
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return
    expect(extracted.value.responses).toHaveLength(2)
    expect(extracted.value.skippedEmpty).toBe(1)
    expect(extracted.value.responses[0]?.respondentMeta).toEqual({})
  })

  it('keeps only the columns it was explicitly asked to keep', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Aspirasi', ['Kelas'])
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return
    // Kelas was asked for; Timestamp was not, so it does not come along.
    expect(extracted.value.responses[0]?.respondentMeta).toEqual({
      Kelas: 'XII IPA 1',
    })
  })

  it('ignores a requested column the sheet does not have', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Aspirasi', ['Nama'])
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return
    // A stale column name must not become an empty key on every row.
    expect(extracted.value.responses[0]?.respondentMeta).toEqual({})
  })

  it('never stores the text column as metadata as well', () => {
    const parsed = parseCsv(CSV)
    if (!parsed.ok) throw new Error('fixture failed to parse')

    const extracted = extractResponses(parsed.value, 'Aspirasi', ['Aspirasi', 'Kelas'])
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return
    expect(extracted.value.responses[0]?.respondentMeta).toEqual({
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
