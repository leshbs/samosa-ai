/**
 * Every claim the landing page makes, in one file, so the copy can be
 * reviewed against the product without reading JSX.
 *
 * Rule for this file: nothing here may state something the product cannot
 * back. The limits below are the validator's constants; the data-handling
 * claims are the privacy policy's. design_system.md §11 sketches social proof
 * ("Dipakai 120+ OSIS…"), customer logos and testimonials — none of those
 * exist yet, so the corresponding lists start empty and their sections render
 * nothing until real ones are added. A fabricated quote on a page whose whole
 * pitch is "every number has evidence" would be the worst possible first
 * impression.
 */

export const NAV_LINKS = [
  { href: '#fitur', label: 'Fitur' },
  { href: '#cara-kerja', label: 'Cara Kerja' },
  { href: '#contoh', label: 'Contoh' },
  { href: '#batasan', label: 'Data & Privasi' },
] as const

/**
 * Tools whose exports SAMOSA reads — every one can save CSV or .xlsx. Names
 * as text, not logos: a logo implies a partnership.
 */
export const EXPORT_SOURCES = [
  'Google Forms',
  'Microsoft Forms',
  'Google Sheets',
  'Microsoft Excel',
  'Typeform',
  'Jotform',
  'Tally',
  'SurveyMonkey',
] as const

/** Organizations that have agreed to be named. Empty until one has. */
export const TRUSTED_BY: readonly string[] = []

export type Testimonial = { quote: string; name: string; role: string }

/** Real quotes with permission only. Empty hides the section. */
export const TESTIMONIALS: readonly Testimonial[] = []

export const STEPS = [
  {
    number: '01',
    title: 'Unggah CSV atau Excel',
    body: 'Ekspor dari Google Forms, Microsoft Forms, atau spreadsheet mana pun, lalu pilih kolom yang berisi aspirasi.',
    detail:
      'Maks. 10 MB dan 5.000 aspirasi. Kolom selain teks aspirasi tidak disimpan kecuali kamu mencentangnya.',
  },
  {
    number: '02',
    title: 'Satu klik analisis',
    body: 'Sentimen, topik, dan kata kunci untuk setiap aspirasi — bukan sampel.',
    detail:
      'Estimasi biaya tampil sebelum kamu menekan tombol, progres tampil selama berjalan.',
  },
  {
    number: '03',
    title: 'Baca, telusuri, ekspor',
    body: 'Ringkasan eksekutif, grafik, dan penjelajah aspirasi dalam satu laporan.',
    detail: 'Setiap angka bisa diklik sampai ke kutipan aslinya. Ekspor ke PDF atau CSV.',
  },
] as const

export const LIMITS = [
  'Maksimal 5.000 aspirasi dan 10 MB per dataset.',
  'Hanya file CSV dan Excel (.xlsx). Integrasi langsung dengan Google Forms belum tersedia.',
  'Hanya 2.000 karakter pertama tiap aspirasi yang dianalisis.',
  'Analisis dikerjakan model bahasa dan bisa keliru — karena itu setiap angka bisa ditelusuri ke kutipannya.',
] as const

export const DATA_PROMISES = [
  'Hanya kolom yang kamu pilih untuk dianalisis yang disimpan. Nama, kelas, dan email dibuang kecuali kamu memilih menyimpannya.',
  'Jawaban di kolom itu dikirim ke OpenAI di Amerika Serikat untuk dianalisis — tanpa isi kolom lain seperti nama atau email.',
  'File asli ikut terhapus saat datasetnya kamu hapus.',
  'Data setiap organisasi terisolasi di tingkat basis data.',
] as const

/** Sample reports, labelled as samples wherever they appear. */
export const GALLERY = [
  {
    title: 'Evaluasi Pensi 2026',
    organization: 'Panitia acara · SMA',
    responses: 310,
    tint: 'bg-ember-50 dark:bg-ember-900/25',
    sentiment: [61, 24, 15],
    topics: [72, 48, 30],
  },
  {
    title: 'Aspirasi Kantin Semester Ganjil',
    organization: 'OSIS · SMP',
    responses: 842,
    tint: 'bg-teal-50 dark:bg-teal-900/40',
    sentiment: [38, 29, 33],
    topics: [80, 55, 41],
  },
  {
    title: 'Refleksi MPLS 2026',
    organization: 'MPK · SMA',
    responses: 1204,
    tint: 'bg-sand-100 dark:bg-secondary',
    sentiment: [54, 31, 15],
    topics: [64, 60, 22],
  },
] as const
