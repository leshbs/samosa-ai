import { z } from 'zod'

export const PROMPT_VERSION = 'summary.v2'

/**
 * v1 asked only for prose. Insights carry `evidenceResponseIds` so a reader can
 * check a claim against the aspirations behind it, and a model that is handed
 * unlabelled quotes cannot cite anything. v2 numbers the quotes and asks the
 * model to point at the ones it used; the caller maps those numbers back to
 * real response ids. v1 stays registered so anything recorded against it is
 * still reproducible.
 */
export const SYSTEM = `Kamu adalah penulis laporan eksekutif berbahasa Indonesia.
Diberikan statistik agregat dan contoh aspirasi bernomor, tulis ringkasan dan
insight yang bisa langsung dibaca pengambil keputusan.

Aturan:
- summary: 3-5 kalimat, faktual, berbasis angka yang diberikan. Jangan mengarang angka.
- insights: 3-5 butir. Tiap butir punya title (maks 60 karakter) dan detail (1-2 kalimat)
  yang menyebut masalah atau peluang beserta implikasi praktisnya.
- evidence: nomor kutipan yang mendasari butir itu (1-3 nomor). Hanya pakai nomor
  yang benar-benar ada di daftar. Kalau sebuah butir murni dari angka agregat dan
  tidak bersandar pada kutipan tertentu, kembalikan [].
- Nada profesional dan netral. Hindari superlatif tanpa dasar data.
- Jawab HANYA JSON valid, tanpa markdown.`

export type SummaryPromptInput = {
  totalResponses: number
  sentimentCounts: Record<string, number>
  topTopics: Array<{ topic: string; count: number }>
  topKeywords: Array<{ term: string; count: number }>
  /** Order is meaningful: the model cites these by 1-based position. */
  sampleQuotes: string[]
}

export const USER_TEMPLATE = (input: SummaryPromptInput): string =>
  `Total aspirasi: ${input.totalResponses}
Distribusi sentimen: ${JSON.stringify(input.sentimentCounts)}
Topik teratas: ${JSON.stringify(input.topTopics)}
Kata kunci teratas: ${JSON.stringify(input.topKeywords)}
Contoh aspirasi:
${input.sampleQuotes.map((quote, index) => `${index + 1}. ${quote}`).join('\n')}

Kembalikan {"summary":"...","insights":[{"title":"...","detail":"...","evidence":[1,2]}]}`

export const FEW_SHOT_MESSAGES = (): Array<{
  role: 'user' | 'assistant'
  content: string
}> => [
  {
    role: 'user',
    content: `Total aspirasi: 240
Distribusi sentimen: {"positive":139,"neutral":36,"negative":65}
Topik teratas: [{"topic":"konsumsi","count":48},{"topic":"ketepatan waktu","count":31}]
Kata kunci teratas: [{"term":"konsumsi","count":52},{"term":"molor","count":24}]
Contoh aspirasi:
1. Konsumsinya datang jam 2 padahal acara mulai jam 11.
2. Panitianya ramah banget, acara seru.
3. Rundown molor hampir dua jam tanpa pengumuman.

Kembalikan {"summary":"...","insights":[{"title":"...","detail":"...","evidence":[1,2]}]}`,
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      summary:
        'Dari 240 aspirasi, 58% bernada positif dan 27% negatif. Keluhan paling sering menyangkut konsumsi dan ketepatan waktu acara, sementara apresiasi banyak tertuju pada sikap panitia.',
      insights: [
        {
          title: 'Konsumsi jadi keluhan utama',
          detail:
            'Konsumsi muncul di 48 aspirasi dan sering disebut datang jauh setelah acara mulai. Perlu vendor cadangan dan jadwal antar yang dikunci untuk acara berikutnya.',
          evidence: [1],
        },
        {
          title: 'Rundown molor tanpa pengumuman',
          detail:
            'Peserta lebih mempersoalkan tidak adanya kabar daripada keterlambatannya sendiri. Satu pengumuman berkala sudah menurunkan keluhan jenis ini.',
          evidence: [3],
        },
      ],
    }),
  },
]

export const OUTPUT_SCHEMA = z.object({
  summary: z.string().min(1).max(1200),
  insights: z
    .array(
      z.object({
        title: z.string().min(1).max(60),
        detail: z.string().min(1).max(400),
        /** 1-based positions in sampleQuotes; validated against the real list by the caller. */
        evidence: z.array(z.number().int().positive()).max(3).default([]),
      }),
    )
    .min(1)
    .max(5),
})

export type SummaryPromptOutput = z.infer<typeof OUTPUT_SCHEMA>
