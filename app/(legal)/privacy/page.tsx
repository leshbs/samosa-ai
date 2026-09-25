import type { Metadata } from 'next'
import {
  DraftNotice,
  LanguageSwitch,
  LegalSection,
  resolveLanguage,
} from '@/components/legal/legal-page'
import { CONTROLLER, LAST_UPDATED, PROCESSORS } from '@/lib/legal/controller'

export const metadata: Metadata = { title: 'Kebijakan Privasi' }

/**
 * Written against what the code actually does, not against a template. The
 * section that matters most is "Pihak ketiga": every aspiration a school
 * uploads is sent to OpenAI in the United States, and a policy that buries
 * that is worse than none.
 *
 * Structured for UU PDP No. 27/2022: what is collected, the legal basis, who
 * it is shared with, where it goes, how long it is kept, and the rights a data
 * subject has. It is still a draft until a lawyer has read it.
 */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const language = resolveLanguage(lang)

  return language === 'id' ? (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Kebijakan Privasi</h1>
          <LanguageSwitch path="/privacy" current={language} />
        </div>
        <p className="text-sm text-muted-foreground">
          Berlaku sejak {LAST_UPDATED}. Dokumen ini menjelaskan data apa yang SAMOSA
          kumpulkan, ke mana perginya, dan apa yang bisa kamu minta.
        </p>
      </header>

      <DraftNotice language={language} />

      <LegalSection heading="1. Siapa yang bertanggung jawab">
        <p>
          Pengendali data untuk SAMOSA adalah {CONTROLLER.legalName}, berkedudukan di{' '}
          {CONTROLLER.address}, {CONTROLLER.jurisdiction}. Pertanyaan dan permintaan soal
          data pribadi dikirim ke{' '}
          <a href={`mailto:${CONTROLLER.contactEmail}`} className="underline">
            {CONTROLLER.contactEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Data yang dikumpulkan">
        <p>
          Ada dua jenis data yang berbeda sifatnya, dan keduanya diperlakukan berbeda.
        </p>
        <p>
          <strong className="text-foreground">Data akunmu.</strong> Alamat email, nama
          tampilan, dan nama organisasi. Kalau kamu masuk lewat Google, kami menerima
          email dan nama dari Google — bukan kata sandimu.
        </p>
        <p>
          <strong className="text-foreground">Data yang kamu unggah.</strong> Isi kolom
          aspirasi dari file CSV atau Excel yang kamu unggah.{' '}
          <strong className="text-foreground">
            Kolom lain di file yang sama — nama, kelas, email, cap waktu — tidak disimpan
          </strong>{' '}
          kecuali kamu mencentangnya satu per satu saat mengunggah. Defaultnya membuang
          semuanya, karena analisis tidak membutuhkannya.
        </p>
        <p>
          File aslinya sendiri tetap tersimpan apa adanya, termasuk kolom yang dibuang
          tadi, supaya unggahan bisa ditelusuri ulang kalau hasilnya dipertanyakan. File
          itu ikut terhapus begitu datasetnya kamu hapus.
        </p>
        <p>
          Aspirasi yang kamu unggah bisa memuat data pribadi orang lain — siswa, anggota,
          peserta acara.{' '}
          <strong className="text-foreground">Kamu yang bertanggung jawab</strong>{' '}
          memastikan mereka tahu aspirasinya dikumpulkan dan dianalisis, terutama kalau
          mereka mengisinya sebelum SAMOSA dipakai.
        </p>
      </LegalSection>

      <LegalSection heading="3. Untuk apa dipakai">
        <p>
          Data akun dipakai untuk mengautentikasi kamu dan memisahkan data antar
          organisasi. Data unggahan dipakai untuk satu hal: menganalisis sentimen, topik,
          dan kata kunci, lalu menyusun laporannya.
        </p>
        <p>
          Kami <strong className="text-foreground">tidak</strong> menjual data, tidak
          memakainya untuk iklan, dan tidak memakainya untuk melatih model AI.
        </p>
      </LegalSection>

      <LegalSection heading="4. Pihak ketiga dan perpindahan data ke luar negeri">
        <p>
          Ini bagian terpenting di halaman ini.{' '}
          <strong className="text-foreground">
            Teks aspirasi yang kamu unggah dikirim ke OpenAI di Amerika Serikat
          </strong>{' '}
          untuk dianalisis. Tanpa itu, aplikasi ini tidak bisa bekerja. Metadata responden
          (nama, kelas, dan kolom lain) <em>tidak</em> ikut dikirim — hanya teks
          aspirasinya.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <strong className="text-foreground">{processor.name}</strong> —{' '}
              {processor.role.id}. Lokasi: {processor.region}.
            </li>
          ))}
        </ul>
        <p>
          Karena sebagian pemrosesan terjadi di luar Indonesia, memakai SAMOSA berarti
          menyetujui perpindahan data tersebut.
        </p>
      </LegalSection>

      <LegalSection heading="5. Penyimpanan dan retensi">
        <p>
          Data disimpan di Supabase, wilayah Tokyo, dengan enkripsi saat disimpan dan saat
          dikirim. Pemisahan antar organisasi dipaksakan di tingkat basis data (row-level
          security), bukan hanya di kode aplikasi.
        </p>
        <p>
          Dataset disimpan sampai kamu menghapusnya. Menghapus dataset akan menghapus
          seluruh aspirasi, hasil analisis, dan laporannya. Penghapusan akun belum
          tersedia lewat aplikasi; sampai fitur itu ada, kirim permintaan ke alamat di
          bagian 1 dan datamu akan dihapus.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cookie">
        <p>
          SAMOSA hanya memakai cookie yang diperlukan untuk menjaga sesi loginmu. Tidak
          ada cookie iklan, tidak ada pelacak pihak ketiga, dan tidak ada analitik
          perilaku — karena itulah tidak ada banner persetujuan cookie di aplikasi ini.
          Kalau suatu saat analitik ditambahkan, banner itu akan muncul lebih dulu.
        </p>
      </LegalSection>

      <LegalSection heading="7. Hakmu">
        <p>
          Berdasarkan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, kamu berhak
          meminta akses ke datamu, memperbaikinya, menghapusnya, menariknya kembali dalam
          format yang bisa dibaca mesin, dan menarik persetujuanmu. Export CSV dan PDF di
          dalam aplikasi sudah memenuhi hak portabilitas untuk data analisis.
        </p>
        <p>
          Permintaan dikirim ke{' '}
          <a href={`mailto:${CONTROLLER.contactEmail}`} className="underline">
            {CONTROLLER.contactEmail}
          </a>{' '}
          dan dijawab dalam 14 hari kerja.
        </p>
      </LegalSection>

      <LegalSection heading="8. Perubahan">
        <p>
          Kalau kebijakan ini berubah secara material, tanggal di atas diperbarui dan
          pengguna terdaftar diberi tahu lewat email sebelum perubahan berlaku.
        </p>
      </LegalSection>
    </article>
  ) : (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Privacy Policy</h1>
          <LanguageSwitch path="/privacy" current={language} />
        </div>
        <p className="text-sm text-muted-foreground">
          Effective {LAST_UPDATED}. This document explains what SAMOSA collects, where it
          goes, and what you can ask for.
        </p>
      </header>

      <DraftNotice language={language} />

      <LegalSection heading="1. Who is responsible">
        <p>
          The data controller for SAMOSA is {CONTROLLER.legalName}, at{' '}
          {CONTROLLER.address}, {CONTROLLER.jurisdiction}. Questions and requests about
          personal data go to{' '}
          <a href={`mailto:${CONTROLLER.contactEmail}`} className="underline">
            {CONTROLLER.contactEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. What is collected">
        <p>Two kinds of data, treated differently.</p>
        <p>
          <strong className="text-foreground">Your account data.</strong> Email address,
          display name and organisation name. If you sign in with Google we receive your
          email and name from Google — never your password.
        </p>
        <p>
          <strong className="text-foreground">What you upload.</strong> The aspiration
          column of the CSV or Excel file you upload.{' '}
          <strong className="text-foreground">
            The other columns in that file — names, classes, emails, timestamps — are not
            stored
          </strong>{' '}
          unless you tick them individually at upload time. The default discards all of
          them, because the analysis does not need them.
        </p>
        <p>
          The original file itself is kept as uploaded, discarded columns included, so an
          upload can be traced back if its results are ever questioned. It is deleted
          along with the dataset.
        </p>
        <p>
          What you upload can contain other people&apos;s personal data — students,
          members, event attendees.{' '}
          <strong className="text-foreground">You are responsible</strong> for making sure
          they know their responses are collected and analysed, particularly if they
          answered before SAMOSA was in use.
        </p>
      </LegalSection>

      <LegalSection heading="3. What it is used for">
        <p>
          Account data authenticates you and separates one organisation&apos;s data from
          another&apos;s. Uploaded data is used for exactly one thing: analysing
          sentiment, topics and keywords, and assembling the report.
        </p>
        <p>
          We do <strong className="text-foreground">not</strong> sell data, use it for
          advertising, or use it to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="4. Third parties and cross-border transfer">
        <p>
          This is the most important section on the page.{' '}
          <strong className="text-foreground">
            The aspiration text you upload is sent to OpenAI in the United States
          </strong>{' '}
          to be analysed. The application cannot work without it. Respondent metadata
          (names, classes, other columns) is <em>not</em> sent — only the aspiration text.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <strong className="text-foreground">{processor.name}</strong> —{' '}
              {processor.role.en}. Location: {processor.region}.
            </li>
          ))}
        </ul>
        <p>
          Because some processing happens outside Indonesia, using SAMOSA means consenting
          to that transfer.
        </p>
      </LegalSection>

      <LegalSection heading="5. Storage and retention">
        <p>
          Data is stored in Supabase, Tokyo region, encrypted at rest and in transit.
          Separation between organisations is enforced in the database itself through
          row-level security, not only in application code.
        </p>
        <p>
          Datasets are kept until you delete them. Deleting a dataset deletes its
          responses, analysis results and report. Account deletion is not yet available in
          the application; until it is, email the address in section 1 and your data will
          be removed.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cookies">
        <p>
          SAMOSA uses only the cookies needed to keep you signed in. No advertising
          cookies, no third-party trackers, no behavioural analytics — which is why there
          is no cookie consent banner. If analytics are ever added, the banner arrives
          first.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          Under Indonesian Law No. 27 of 2022 on Personal Data Protection you may request
          access to your data, correct it, delete it, receive it in a machine-readable
          format, and withdraw your consent. The in-app CSV and PDF exports already serve
          the portability right for analysis data.
        </p>
        <p>
          Requests go to{' '}
          <a href={`mailto:${CONTROLLER.contactEmail}`} className="underline">
            {CONTROLLER.contactEmail}
          </a>{' '}
          and are answered within 14 working days.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes">
        <p>
          If this policy changes materially, the date above is updated and registered
          users are notified by email before the change takes effect.
        </p>
      </LegalSection>
    </article>
  )
}
