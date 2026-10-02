// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  retentionArchivedEmail,
  retentionNoticeEmail,
} from '@/modules/notifications/templates/messages'

const BASE = {
  recipientName: 'Rani',
  organizationName: 'OSIS Nusantara',
  datasets: [
    { name: 'Survei Kantin', responseCount: 1540 },
    { name: 'Survei <Kelas>', responseCount: 80 },
  ],
  url: 'https://samosa.test/settings?tab=data',
}

describe('retentionNoticeEmail', () => {
  it('says what happens, when, and how to keep the data', () => {
    const email = retentionNoticeEmail({ ...BASE, final: false, archiveOn: '1 Jan 2027' })

    expect(email.subject).toBe('2 dataset di OSIS Nusantara akan diarsipkan 1 Jan 2027')
    expect(email.text).toContain('Halo Rani,')
    expect(email.text).toContain('habis pada 1 Jan 2027')
    // Archived is not deleted, and the email must not let it read that way.
    expect(email.text).toContain('belum dihapus')
    expect(email.text).toContain('90 hari')
    expect(email.text).toContain('Survei Kantin: 1.540 aspirasi')
    expect(email.text).toContain('https://samosa.test/settings?tab=data')
  })

  it('marks the last one as the last one', () => {
    const email = retentionNoticeEmail({ ...BASE, final: true, archiveOn: '1 Jan 2027' })

    expect(email.subject).toMatch(/^Terakhir:/)
    expect(email.text).toContain('Pengingat terakhir sebelum diarsipkan')
  })

  it('says it cannot be switched off, so nobody looks for the setting', () => {
    const email = retentionNoticeEmail({ ...BASE, final: false, archiveOn: '1 Jan 2027' })

    expect(email.text).toContain('selalu dikirim')
  })

  it('escapes dataset names in the HTML', () => {
    const email = retentionNoticeEmail({ ...BASE, final: false, archiveOn: '1 Jan 2027' })

    expect(email.html).toContain('Survei &lt;Kelas&gt;')
    expect(email.html).not.toContain('Survei <Kelas>')
  })

  it('names a handful and counts the rest', () => {
    const datasets = Array.from({ length: 8 }, (_, index) => ({
      name: `Survei ${index + 1}`,
      responseCount: 10,
    }))
    const email = retentionNoticeEmail({
      ...BASE,
      datasets,
      final: false,
      archiveOn: '1 Jan 2027',
    })

    expect(email.subject).toContain('8 dataset')
    expect(email.text).toContain('Survei 5: 10 aspirasi')
    expect(email.text).not.toContain('Survei 6:')
    expect(email.text).toContain('Dan lainnya: 3 dataset')
  })
})

describe('retentionArchivedEmail', () => {
  it('gives the deletion date and the way to get the data out', () => {
    const email = retentionArchivedEmail({ ...BASE, deleteOn: '1 Apr 2027' })

    expect(email.subject).toBe('2 dataset di OSIS Nusantara sudah diarsipkan')
    expect(email.text).toContain('Dihapus pada: 1 Apr 2027')
    expect(email.text).toContain('Sampai 1 Apr 2027 kamu masih bisa mengunduh')
    expect(email.text).toContain('pulih')
    expect(email.text).toContain('Unduh arsip: https://samosa.test/settings?tab=data')
  })
})
