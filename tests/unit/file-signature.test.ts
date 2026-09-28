import { describe, expect, it } from 'vitest'
import {
  validateFileSignature,
  validateUploadFile,
} from '@/modules/ingestion/validators/file-signature'

const bytes = (...values: number[]) => new Uint8Array(values).buffer
const text = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer

const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0]

describe('validateUploadFile', () => {
  it('accepts the three extensions the wizard offers', () => {
    for (const name of ['aspirasi.csv', 'aspirasi.xlsx', 'aspirasi.xls']) {
      expect(validateUploadFile({ name, type: 'text/csv' }).ok).toBe(true)
    }
  })

  it('is case insensitive about the extension', () => {
    expect(validateUploadFile({ name: 'ASPIRASI.CSV', type: '' }).ok).toBe(true)
  })

  it('rejects an extension we cannot parse', () => {
    const result = validateUploadFile({ name: 'laporan.pdf', type: 'application/pdf' })
    expect(result.ok).toBe(false)
  })

  it('rejects a file with no extension', () => {
    expect(validateUploadFile({ name: 'aspirasi', type: 'text/csv' }).ok).toBe(false)
  })

  it('tolerates the MIME types browsers actually send for CSV', () => {
    // Windows reports .csv as an Excel type; some browsers send nothing.
    for (const type of ['', 'text/csv', 'text/plain', 'application/vnd.ms-excel']) {
      expect(validateUploadFile({ name: 'a.csv', type }).ok).toBe(true)
    }
  })

  it('rejects a MIME type outside the whitelist', () => {
    expect(validateUploadFile({ name: 'a.csv', type: 'text/html' }).ok).toBe(false)
  })
})

describe('validateFileSignature', () => {
  it('accepts plain CSV text', () => {
    expect(validateFileSignature(text('Nama,Aspirasi\nAni,Kantin'), 'csv').ok).toBe(true)
  })

  it('accepts a UTF-8 BOM, which Excel writes', () => {
    expect(validateFileSignature(text('﻿Nama,Aspirasi\nAni,x'), 'csv').ok).toBe(true)
  })

  it('accepts a zip-shaped file as xlsx', () => {
    expect(validateFileSignature(bytes(...ZIP, 0x14, 0x00), 'xlsx').ok).toBe(true)
  })

  it('accepts the legacy OLE2 .xls container', () => {
    expect(validateFileSignature(bytes(...OLE2, 0xa1, 0xb1), 'xlsx').ok).toBe(true)
  })

  it('rejects a PDF renamed to .csv', () => {
    const result = validateFileSignature(text('%PDF-1.7\n%âãÏÓ'), 'csv')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.details?.detected).toBe('PDF')
  })

  it('rejects an executable posted as xlsx', () => {
    // A PE file would otherwise reach the xlsx parser, which is not hardened.
    expect(validateFileSignature(bytes(0x4d, 0x5a, 0x90, 0x00), 'xlsx').ok).toBe(false)
  })

  it('rejects a spreadsheet posted as csv, with advice', () => {
    const result = validateFileSignature(bytes(...ZIP, 0x14), 'csv')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('.xlsx')
  })

  it('rejects text that is not a spreadsheet when xlsx is claimed', () => {
    expect(validateFileSignature(text('Nama,Aspirasi'), 'xlsx').ok).toBe(false)
  })

  it('rejects binary content hiding behind a .csv name', () => {
    // UTF-16 lands here too: it parses as mojibake rather than failing loudly.
    expect(validateFileSignature(bytes(0x4e, 0x00, 0x61, 0x00), 'csv').ok).toBe(false)
  })

  it('rejects an empty file', () => {
    expect(validateFileSignature(new ArrayBuffer(0), 'csv').ok).toBe(false)
  })
})
