// @vitest-environment node
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  detectImageFormat,
  isPathUnder,
  validateImage,
} from '@/modules/auth/services/branding'
import {
  createInvitationToken,
  hashInvitationToken,
  maskEmail,
} from '@/modules/auth/services/invitations'
import { confirmationMatches } from '@/modules/auth/services/organization'
import { archiveSlug, buildArchive } from '@/modules/reporting/exporters/archive'
import { exportDatasetToCsv } from '@/modules/reporting/exporters/csv-exporter'
import { parseSettingsTab } from '@/components/settings/settings-tabs'
import { initialsOf } from '@/components/ui/user-avatar'
import { formatDateTime } from '@/lib/utils'
import { acceptInvitationSchema, updateOrganizationSchema } from '@/types/api'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

describe('image checks for logos and avatars', () => {
  it('reads the format from the bytes, not the name', () => {
    expect(detectImageFormat(PNG)).toBe('png')
    expect(detectImageFormat(JPEG)).toBe('jpg')
    // GIF and WebP are real images the PDF renderer cannot embed.
    expect(detectImageFormat(GIF)).toBeNull()
  })

  it('refuses empty, oversized and unsupported files with a reason', () => {
    expect(validateImage(new Uint8Array()).ok).toBe(false)

    const big = new Uint8Array(1024 * 1024 + 1)
    big.set(PNG)
    const tooBig = validateImage(big)
    expect(tooBig.ok).toBe(false)
    if (!tooBig.ok) expect(tooBig.error.message).toContain('1 MB')

    const gif = validateImage(GIF)
    expect(gif.ok).toBe(false)
    if (!gif.ok) expect(gif.error.message).toContain('PNG atau JPEG')

    expect(validateImage(PNG)).toEqual({ ok: true, value: 'png' })
  })

  it('only signs or reads paths inside their owner prefix', () => {
    expect(isPathUnder('org/abc/logo-1.png', 'org/abc/')).toBe(true)
    // Another tenant's logo, written into a column by a crafted request.
    expect(isPathUnder('org/xyz/logo-1.png', 'org/abc/')).toBe(false)
    expect(isPathUnder('org/abc/../xyz/logo.png', 'org/abc/')).toBe(false)
    expect(isPathUnder('org/abc/', 'org/abc/')).toBe(false)
    expect(isPathUnder(null, 'org/abc/')).toBe(false)
  })
})

describe('invitation tokens', () => {
  it('are long, URL-safe, and accepted by the route schema', () => {
    const token = createInvitationToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(acceptInvitationSchema.safeParse({ token }).success).toBe(true)
    expect(createInvitationToken()).not.toBe(token)
  })

  it('are stored as a SHA-256, never as themselves', () => {
    const token = createInvitationToken()
    const hash = hashInvitationToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(hashInvitationToken(token)).toBe(hash)
  })

  it('reveal only enough of the email to recognise it', () => {
    expect(maskEmail('budi.santoso@gmail.com')).toBe('b***@gmail.com')
    expect(maskEmail('not-an-email')).toBe('***')
  })
})

describe('typed confirmation', () => {
  it('ignores case and stray whitespace, nothing else', () => {
    expect(confirmationMatches('  osis   nusantara ', 'OSIS Nusantara')).toBe(true)
    expect(confirmationMatches('OSIS Nusantar', 'OSIS Nusantara')).toBe(false)
    expect(confirmationMatches('', '')).toBe(false)
  })
})

describe('updateOrganizationSchema', () => {
  it('accepts any subset but not nothing', () => {
    expect(
      updateOrganizationSchema.safeParse({ timezone: 'Asia/Jayapura' }).success,
    ).toBe(true)
    expect(
      updateOrganizationSchema.safeParse({ reportIncludeQuotes: false }).success,
    ).toBe(true)
    expect(updateOrganizationSchema.safeParse({}).success).toBe(false)
    expect(
      updateOrganizationSchema.safeParse({ timezone: 'Europe/London' }).success,
    ).toBe(false)
  })
})

describe('formatDateTime', () => {
  const noonUtc = '2026-09-29T05:00:00Z'

  it('prints in the organization zone and says which', () => {
    expect(formatDateTime(noonUtc)).toMatch(/12[.:]00 WIB$/)
    expect(formatDateTime(noonUtc, 'Asia/Makassar')).toMatch(/13[.:]00 WITA$/)
    expect(formatDateTime(noonUtc, 'Asia/Jayapura')).toMatch(/14[.:]00 WIT$/)
  })
})

describe('settings tabs', () => {
  it('fall back to the first tab for anything unknown', () => {
    expect(parseSettingsTab('anggota')).toBe('anggota')
    expect(parseSettingsTab('billing')).toBe('organisasi')
    expect(parseSettingsTab(undefined)).toBe('organisasi')
  })
})

describe('initialsOf', () => {
  it('takes first and last word, or the email handle', () => {
    expect(initialsOf('Rani Putri Lestari')).toBe('RL')
    expect(initialsOf('rani@osis.test')).toBe('R')
    expect(initialsOf('OSIS Nusantara 2026')).toBe('ON')
    expect(initialsOf('')).toBe('?')
  })
})

describe('organization archive', () => {
  it('packs files that unzip back to what went in', () => {
    const zip = buildArchive([
      { path: 'metadata.json', content: '{"a":1}' },
      { path: 'reports/x.pdf', content: new Uint8Array([37, 80, 68, 70]) },
    ])
    const files = unzipSync(zip)

    expect(strFromU8(files['metadata.json'] as Uint8Array)).toBe('{"a":1}')
    expect([...(files['reports/x.pdf'] as Uint8Array)]).toEqual([37, 80, 68, 70])
  })

  it('keeps both files when two datasets share a name', () => {
    const files = unzipSync(
      buildArchive([
        { path: 'datasets/survei.csv', content: 'a' },
        { path: 'datasets/survei.csv', content: 'b' },
      ]),
    )
    expect(Object.keys(files).sort()).toEqual([
      'datasets/survei-2.csv',
      'datasets/survei.csv',
    ])
  })

  it('makes readable ASCII file names', () => {
    expect(archiveSlug('Évaluasi Pensi 2026!', 'x')).toBe('evaluasi-pensi-2026')
    expect(archiveSlug('???', 'laporan')).toBe('laporan')
  })
})

describe('exportDatasetToCsv', () => {
  it('lines up kept columns across rows, including ones later rows added', () => {
    const csv = exportDatasetToCsv([
      { id: 'r1', text: 'Kantin mahal', respondentMeta: { kelas: 'XI' } },
      {
        id: 'r2',
        text: 'Parkir, sempit',
        respondentMeta: { kelas: 'X', jurusan: 'IPA' },
      },
    ])
    const lines = csv.replace(/^﻿/, '').split('\n')

    expect(lines[0]).toBe('response_id,response,kelas,jurusan')
    expect(lines[1]).toBe('r1,Kantin mahal,XI,')
    expect(lines[2]).toBe('r2,"Parkir, sempit",X,IPA')
  })
})
