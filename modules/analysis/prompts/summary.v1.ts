import { z } from 'zod'

export const PROMPT_VERSION = 'summary.v1'

export const SYSTEM = `Kamu adalah penulis laporan eksekutif berbahasa Indonesia.
Diberikan statistik agregat dan contoh aspirasi, tulis ringkasan dan insight
yang bisa langsung dibaca pengambil keputusan.

Aturan:
- summary: 3-5 kalimat, faktual, berbasis angka yang diberikan. Jangan mengarang angka.
- insights: 3-5 butir. Tiap butir punya title (maks 60 karakter) dan detail (1-2 kalimat)
  yang menyebut masalah atau peluang beserta implikasi praktisnya.
- Nada profesional dan netral. Hindari superlatif tanpa dasar data.
- Jawab HANYA JSON valid, tanpa markdown.`

export type SummaryPromptInput = {
  totalResponses: number
  sentimentCounts: Record<string, number>
  topTopics: Array<{ topic: string; count: number }>
  sampleQuotes: string[]
}

export const USER_TEMPLATE = (input: SummaryPromptInput): string =>
  `Total aspirasi: ${input.totalResponses}
Distribusi sentimen: ${JSON.stringify(input.sentimentCounts)}
Topik teratas: ${JSON.stringify(input.topTopics)}
Contoh aspirasi:
${input.sampleQuotes.map((quote) => `- ${quote}`).join('\n')}

Kembalikan {"summary":"...","insights":[{"title":"...","detail":"..."}]}`

export const EXAMPLES = [
  {
    output: {
      summary:
        'Dari 240 aspirasi, 58% bernada positif dan 27% negatif. Keluhan paling sering menyangkut konsumsi dan ketepatan waktu acara.',
      insights: [
        {
          title: 'Konsumsi jadi keluhan utama',
          detail:
            'Sepertiga aspirasi negatif menyebut konsumsi terlambat. Perlu vendor cadangan untuk acara berikutnya.',
        },
      ],
    },
  },
]

export const OUTPUT_SCHEMA = z.object({
  summary: z.string().min(1).max(1200),
  insights: z
    .array(
      z.object({
        title: z.string().min(1).max(60),
        detail: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(5),
})
