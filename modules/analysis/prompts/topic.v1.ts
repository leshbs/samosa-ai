import { z } from 'zod'

export const PROMPT_VERSION = 'topic.v1'

export const SYSTEM = `Kamu adalah analis riset kualitatif berbahasa Indonesia.
Diberikan daftar topik mentah hasil ekstraksi per-aspirasi, gabungkan topik yang
bermakna sama menjadi kelompok topik kanonik.

Aturan:
- Maksimal 12 kelompok. Gabungkan sinonim, singkatan, dan variasi ejaan.
- canonical: frasa benda ringkas, huruf kecil, bahasa Indonesia.
- members: daftar topik mentah yang masuk ke kelompok itu, apa adanya.
- Setiap topik mentah masuk tepat ke satu kelompok.
- Jawab HANYA JSON valid, tanpa markdown.`

export const USER_TEMPLATE = (rawTopics: string[]): string =>
  `Topik mentah:
${rawTopics.map((topic) => `- ${topic}`).join('\n')}

Kembalikan {"clusters":[{"canonical":"...","members":["..."]}]}`

export const EXAMPLES = [
  {
    input: ['konsumsi', 'makanan', 'snack acara'],
    output: { canonical: 'konsumsi', members: ['konsumsi', 'makanan', 'snack acara'] },
  },
]

export const OUTPUT_SCHEMA = z.object({
  clusters: z
    .array(
      z.object({
        canonical: z.string().min(1),
        members: z.array(z.string().min(1)).min(1),
      }),
    )
    .max(12),
})
