import { renderEmail, type RenderedEmail } from './layout'

/**
 * The three emails SAMOSA sends. Pure functions of their input, so every
 * wording decision is testable without a mail server.
 */

export type FinishedStatus = 'succeeded' | 'partial' | 'failed'

export type AnalysisFinishedInput = {
  recipientName: string
  organizationName: string
  datasetName: string
  status: FinishedStatus
  analyzed: number
  total: number
  failed: number
  finishedAt: string
  /** The report when there is one to read, the job page when it failed. */
  url: string
}

const STATUS_WORDS: Record<FinishedStatus, string> = {
  succeeded: 'selesai',
  partial: 'selesai sebagian',
  failed: 'gagal',
}

function greeting(name: string): string {
  return name.trim() ? `Halo ${name.trim()},` : 'Halo,'
}

/**
 * Checklist 5.6: dataset name, response count, status, one button. Sent to
 * whoever started the job, so closing the tab mid-analysis no longer means
 * checking back by hand.
 */
export function analysisFinishedEmail(input: AnalysisFinishedInput): RenderedEmail {
  const word = STATUS_WORDS[input.status]
  const count = input.analyzed.toLocaleString('id-ID')
  const total = input.total.toLocaleString('id-ID')

  const summary =
    input.status === 'failed'
      ? `Analisis dataset "${input.datasetName}" gagal. Datanya tetap tersimpan, dan halaman analisis menjelaskan penyebabnya.`
      : input.status === 'partial'
        ? `Analisis dataset "${input.datasetName}" selesai, tapi ${input.failed.toLocaleString('id-ID')} aspirasi tidak berhasil dianalisis. Laporannya tetap bisa dibaca dan menandai bagian yang kurang.`
        : `Analisis dataset "${input.datasetName}" selesai dan laporannya siap dibaca.`

  return renderEmail(`Analisis "${input.datasetName}" ${word}`, {
    preheader: `${count} dari ${total} aspirasi dianalisis.`,
    heading: `Analisis ${word}`,
    paragraphs: [greeting(input.recipientName), summary],
    facts: [
      { label: 'Dataset', value: input.datasetName },
      { label: 'Aspirasi dianalisis', value: `${count} dari ${total}` },
      { label: 'Status', value: word.charAt(0).toUpperCase() + word.slice(1) },
      { label: 'Waktu', value: input.finishedAt },
    ],
    action:
      input.status === 'failed'
        ? { label: 'Lihat detail analisis', url: input.url }
        : { label: 'Buka laporan', url: input.url },
    footnote: `Kamu menerima email ini karena menjalankan analisis di ${input.organizationName}. Matikan di Pengaturan → Notifikasi.`,
  })
}

export type InvitationEmailInput = {
  organizationName: string
  inviterName: string
  roleLabel: string
  roleDescription: string
  url: string
  expiresAt: string
}

export function invitationEmail(input: InvitationEmailInput): RenderedEmail {
  const inviter = input.inviterName.trim() || 'Pengurus'
  return renderEmail(`Undangan bergabung ke ${input.organizationName} di SAMOSA`, {
    preheader: `${inviter} mengundangmu sebagai ${input.roleLabel}.`,
    heading: `Bergabung ke ${input.organizationName}`,
    paragraphs: [
      `${inviter} mengundangmu ke ${input.organizationName} di SAMOSA sebagai ${input.roleLabel}: ${input.roleDescription}`,
      'Masuk atau daftar dengan alamat email ini, lalu terima undangannya.',
    ],
    facts: [{ label: 'Berlaku sampai', value: input.expiresAt }],
    action: { label: 'Terima undangan', url: input.url },
    footnote:
      'Kalau kamu tidak mengenal organisasi ini, abaikan saja email ini. Tanpa diterima, undangan tidak memberi akses apa pun.',
  })
}

export type OwnershipEmailInput = {
  organizationName: string
  previousOwnerName: string
  newOwnerName: string
  audience: 'previous' | 'new'
  url: string
}

/**
 * Checklist 5.2: both parties are told. The old owner's copy doubles as the
 * alarm if they did not do this themselves.
 */
export function ownershipTransferredEmail(input: OwnershipEmailInput): RenderedEmail {
  const previous = input.previousOwnerName.trim() || 'Pemilik sebelumnya'
  const next = input.newOwnerName.trim() || 'anggota lain'

  const paragraphs =
    input.audience === 'new'
      ? [
          `${previous} menyerahkan kepemilikan ${input.organizationName} kepadamu. Sekarang kamu pemiliknya: kamu bisa mengubah pengaturan organisasi, mengelola anggota, dan menyerahkannya lagi kelak.`,
          `${previous} tetap ada di organisasi sebagai Admin. Kamu bisa mengubah atau mencabut aksesnya di Pengaturan → Anggota.`,
        ]
      : [
          `Kepemilikan ${input.organizationName} sudah diserahkan kepada ${next}. Kamu tetap bisa masuk sebagai Admin.`,
          'Kalau bukan kamu yang melakukan ini, segera ganti password-mu dan hubungi pemilik yang baru.',
        ]

  return renderEmail(`Kepemilikan ${input.organizationName} sudah diserahkan`, {
    preheader:
      input.audience === 'new'
        ? `Kamu sekarang pemilik ${input.organizationName}.`
        : `Pemilik baru: ${next}.`,
    heading: 'Serah terima kepemilikan',
    paragraphs,
    action: { label: 'Buka pengaturan', url: input.url },
    footnote: `Email ini dikirim ke pemilik lama dan pemilik baru ${input.organizationName}.`,
  })
}
