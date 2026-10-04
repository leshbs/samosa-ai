import type { QuestionMode } from '@/types/domain'

/**
 * Layer 1 of the non-answer filter (pilot 01, §3.2): answers that say the
 * respondent has nothing to say, caught before any model call.
 *
 * Exact match after normalizing, never "contains": "tidak ada masalah, sudah
 * bagus" is feedback, and only the model can tell it apart from "tidak ada".
 * Anything ambiguous is left to layer 2, the `no_content` label in the prompt.
 *
 * Normalizing also undoes two habits of typed speech, because layer 2 proved
 * unreliable on exactly these: on the pilot data `analysis.v3` labelled
 * "tidak adaa" and "sejauh ini tidak ada" as `negative`, counting "no
 * criticism" as criticism (docs/research/prompt-comparison-01.md §4). What is
 * left after them must still match a phrase below in full.
 *
 * Deliberately absent: "aman", "sudah bagus", "semua baik", "cukup", "sudah
 * oke". Those are short, but they are positive feedback.
 */
const NON_ANSWERS = new Set([
  'tidak ada',
  'tdk ada',
  'ga ada',
  'gaada',
  'gada',
  'nggak ada',
  'engga ada',
  'belum ada',
  'tidak',
  'ga',
  'nihil',
  'none',
  'no',
  // Spellings of the same phrases seen in Indonesian forms.
  'gak ada',
  'gk ada',
  'ngga ada',
  'enggak ada',
  // "N/A" and "n.a." once punctuation is gone.
  'n a',
])

/**
 * Lowercase, punctuation to spaces, whitespace collapsed. "Tidak ada..." and
 * "tidak-ada" both become "tidak ada"; "-", "–", "." and "..." become "".
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Words that soften or delay a non-answer without adding to it. Closed lists:
 * a word belongs here only if "<word> tidak ada" or "tidak ada <word>" still
 * says nothing. Longer lead-ins come first, so "sementara ini" is not cut down
 * to a stray "ini".
 */
const LEAD_INS = [
  'untuk saat ini',
  'sementara ini',
  'sejauh ini',
  'saat ini',
  'sementara',
  'sepertinya',
  'kayaknya',
  'mungkin',
  'jujur',
]
const PARTICLES = ['sih', 'kok', 'deh', 'kak', 'ya', 'aja', 'hehe']

/**
 * The phrase a non-answer is matched on: a final letter held down is let go
 * ("adaa" → "ada", "tidakk" → "tidak"), and lead-ins and closing particles are
 * dropped from the ends. Never from the middle, and never the whole answer.
 */
function corePhrase(normalized: string): string {
  let phrase = normalized.replace(/(\p{L})\1+(?=\s|$)/gu, '$1')

  for (let changed = true; changed;) {
    changed = false
    for (const lead of LEAD_INS) {
      if (phrase.startsWith(`${lead} `)) {
        phrase = phrase.slice(lead.length + 1)
        changed = true
      }
    }
    for (const particle of PARTICLES) {
      if (phrase.endsWith(` ${particle}`)) {
        phrase = phrase.slice(0, -(particle.length + 1))
        changed = true
      }
    }
  }

  return phrase
}

/**
 * What is left when the question asks for a choice or a number. There "tidak",
 * "tidak ada" and "no" are answers — to "Apakah kamu ikut lagi?", to "Kegiatan
 * apa yang kurang seru?" — so only the marks that say nothing at all are
 * dropped before the model.
 */
const BLANK_ANSWERS = new Set(['n a'])

export function isNonAnswer(text: string, mode: QuestionMode = 'evaluative'): boolean {
  const normalized = normalizeAnswer(text)
  if (normalized === '') return true
  return mode === 'categorical' || mode === 'scale'
    ? BLANK_ANSWERS.has(normalized)
    : NON_ANSWERS.has(corePhrase(normalized))
}
