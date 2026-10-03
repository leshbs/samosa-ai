import type { QuestionMode } from '@/types/domain'

/**
 * Layer 1 of the non-answer filter (pilot 01, §3.2): answers that say the
 * respondent has nothing to say, caught before any model call.
 *
 * Exact match after normalizing, never "contains": "tidak ada masalah, sudah
 * bagus" is feedback, and only the model can tell it apart from "tidak ada".
 * Anything ambiguous is left to layer 2, the `no_content` label in the prompt.
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
    : NON_ANSWERS.has(normalized)
}
