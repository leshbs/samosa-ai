import type { Metadata } from 'next'
import Link from 'next/link'
import {
  DraftNotice,
  LanguageSwitch,
  LegalSection,
  resolveLanguage,
} from '@/components/legal/legal-page'
import { CONTROLLER, LAST_UPDATED } from '@/lib/legal/controller'

export const metadata: Metadata = { title: 'Ketentuan Layanan' }

/**
 * Deliberately short, and deliberately honest about the two things a user of
 * an AI analysis tool most needs to know: the model is sometimes wrong, and
 * there is no uptime promise behind a free product built by one person.
 */
export default async function TermsPage({
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
          <h1 className="text-2xl font-semibold">Ketentuan Layanan</h1>
          <LanguageSwitch path="/terms" current={language} />
        </div>
        <p className="text-sm text-muted-foreground">Berlaku sejak {LAST_UPDATED}.</p>
      </header>

      <DraftNotice language={language} />

      <LegalSection heading="1. Layanan ini">
        <p>
          SAMOSA mengubah kumpulan aspirasi menjadi laporan: sebaran sentimen, topik, kata
          kunci, dan ringkasan yang disusun AI. Layanan disediakan oleh{' '}
          {CONTROLLER.legalName}.
        </p>
      </LegalSection>

      <LegalSection heading="2. Akun">
        <p>
          Satu akun dipakai satu orang. Kamu bertanggung jawab menjaga kata sandimu dan
          atas semua aktivitas di akunmu. Beri tahu kami kalau kamu menduga akunmu dipakai
          orang lain.
        </p>
      </LegalSection>

      <LegalSection heading="3. Data yang kamu unggah">
        <p>
          Data yang kamu unggah tetap milikmu. Dengan mengunggah, kamu menyatakan bahwa
          kamu berhak melakukannya dan sudah memenuhi kewajiban terhadap orang-orang yang
          datanya ada di dalamnya.
        </p>
        <p>Dilarang mengunggah data yang kamu tidak punya izin untuk memprosesnya.</p>
      </LegalSection>

      <LegalSection heading="4. Hasil analisis bukan kebenaran mutlak">
        <p>
          Analisis sentimen dan topik dikerjakan model bahasa, dan{' '}
          <strong className="text-foreground">model bahasa bisa salah</strong>. Sebuah
          keluhan bisa terbaca netral; sebuah pujian yang sarkastis bisa terbaca positif.
          Setiap laporan menyertakan aspirasi aslinya justru supaya kamu bisa
          memeriksanya.
        </p>
        <p>
          Jangan jadikan keluaran SAMOSA satu-satunya dasar keputusan yang berdampak pada
          orang — terutama keputusan soal individu yang aspirasinya dianalisis.
        </p>
      </LegalSection>

      <LegalSection heading="5. Pemakaian yang dilarang">
        <ul className="list-disc space-y-1 pl-5">
          <li>Mengunggah data pribadi tanpa dasar yang sah.</li>
          <li>
            Memakai layanan untuk mengawasi, memeringkat, atau menghukum individu
            berdasarkan aspirasi yang mereka kirim.
          </li>
          <li>Mencoba menembus pemisahan data antar organisasi.</li>
          <li>Membebani layanan secara otomatis di luar batas wajar pemakaian.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Ketersediaan dan biaya">
        <p>
          Layanan disediakan apa adanya, tanpa jaminan ketersediaan. Analisis bergantung
          pada penyedia AI pihak ketiga yang bisa mengalami gangguan atau mengubah
          harganya. Kalau nanti ada biaya berlangganan, itu diberitahukan lebih dulu dan
          tidak berlaku surut.
        </p>
      </LegalSection>

      <LegalSection heading="7. Penghentian">
        <p>
          Kamu bisa berhenti kapan saja. Kami bisa menangguhkan akun yang melanggar
          ketentuan ini, dan akan menjelaskan alasannya kecuali hukum melarang.
        </p>
      </LegalSection>

      <LegalSection heading="8. Hukum yang berlaku">
        <p>
          Ketentuan ini tunduk pada hukum {CONTROLLER.jurisdiction}. Soal data pribadi,
          baca juga{' '}
          <Link href="/privacy" className="underline">
            Kebijakan Privasi
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  ) : (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Terms of Service</h1>
          <LanguageSwitch path="/terms" current={language} />
        </div>
        <p className="text-sm text-muted-foreground">Effective {LAST_UPDATED}.</p>
      </header>

      <DraftNotice language={language} />

      <LegalSection heading="1. The service">
        <p>
          SAMOSA turns a collection of open-ended responses into a report: sentiment
          distribution, topics, keywords, and an AI-written summary. The service is
          provided by {CONTROLLER.legalName}.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts">
        <p>
          One account, one person. You are responsible for keeping your password safe and
          for everything done through your account. Tell us if you think someone else is
          using it.
        </p>
      </LegalSection>

      <LegalSection heading="3. Data you upload">
        <p>
          What you upload stays yours. By uploading it you confirm you are entitled to,
          and that you have met your obligations to the people whose data it contains.
        </p>
        <p>Do not upload data you have no lawful basis to process.</p>
      </LegalSection>

      <LegalSection heading="4. Analysis output is not ground truth">
        <p>
          Sentiment and topic analysis is done by a language model, and{' '}
          <strong className="text-foreground">language models get things wrong</strong>. A
          complaint can read as neutral; sarcasm can read as praise. Every report keeps
          the original responses alongside the charts precisely so you can check.
        </p>
        <p>
          Do not make SAMOSA&apos;s output the sole basis for a decision that affects
          people — least of all a decision about the individuals whose responses were
          analysed.
        </p>
      </LegalSection>

      <LegalSection heading="5. Prohibited use">
        <ul className="list-disc space-y-1 pl-5">
          <li>Uploading personal data without a lawful basis.</li>
          <li>
            Using the service to monitor, rank or punish individuals based on the
            responses they submitted.
          </li>
          <li>Attempting to cross the separation between organisations&apos; data.</li>
          <li>Loading the service automatically beyond reasonable use.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Availability and cost">
        <p>
          The service is provided as is, with no availability guarantee. Analysis depends
          on a third-party AI provider that can have outages or change its pricing. If
          subscription fees are introduced, they will be announced in advance and will not
          apply retroactively.
        </p>
      </LegalSection>

      <LegalSection heading="7. Termination">
        <p>
          You may stop at any time. We may suspend an account that breaches these terms,
          and will explain why unless the law prevents it.
        </p>
      </LegalSection>

      <LegalSection heading="8. Governing law">
        <p>
          These terms are governed by the law of {CONTROLLER.jurisdiction}. For personal
          data, read the{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{' '}
          as well.
        </p>
      </LegalSection>
    </article>
  )
}
