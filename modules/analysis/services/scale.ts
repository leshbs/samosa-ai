import { isNonAnswer } from './no-content'

/**
 * Reads an answer to a `scale` question (pilot 01, §4.1) without a model: a
 * number is a number, and asking a language model to copy it out would cost
 * money to add a chance of error.
 *
 * The value becomes the row's one "topic", so a scale answer is stored,
 * counted, filtered and exported exactly like any other result.
 */

/** "4", "4.5", "8,5" — and the same in front of a denominator. */
const NUMBER = String.raw`\d{1,6}(?:[.,]\d{1,2})?`
const RATIO = new RegExp(String.raw`^(${NUMBER})\s*(?:/|dari|per|of)\s*${NUMBER}$`, 'i')
const ANY_NUMBER = new RegExp(NUMBER, 'g')

/**
 * A number written out, when it is the whole answer: "lima" on a 1–5 scale is
 * a 5, and left as a word it would sit outside the mean beside four hundred 5s.
 */
const NUMBER_WORDS: Record<string, string> = {
  nol: '0',
  satu: '1',
  dua: '2',
  tiga: '3',
  empat: '4',
  lima: '5',
  enam: '6',
  tujuh: '7',
  delapan: '8',
  sembilan: '9',
  sepuluh: '10',
}

/** A label long enough for "sangat tidak setuju", short enough to be a bar. */
const MAX_LABEL_LENGTH = 60

function canonical(raw: string): string | null {
  const value = Number.parseFloat(raw.replace(',', '.'))
  // 4.0 and 4 are one bar.
  return Number.isFinite(value) ? String(value) : null
}

/**
 * The value an answer gives, or null when it gives none ("-", blank).
 *
 * - "4", "4.0", " 4 " → "4"; "8,5" → "8.5"
 * - "4/5", "4 dari 5" → "4": the first number is the answer, the second the scale
 * - "5 bintang", "nilai 4" → the one number in it
 * - "lima" → "5", when the word is the whole answer
 * - "sangat setuju" → "sangat setuju": counted as written, and left out of the mean
 */
export function scaleValue(text: string): string | null {
  if (isNonAnswer(text, 'scale')) return null

  const trimmed = text.trim()
  const ratio = RATIO.exec(trimmed)
  if (ratio?.[1]) return canonical(ratio[1])

  const numbers = trimmed.match(ANY_NUMBER) ?? []
  if (numbers.length === 1 && numbers[0]) return canonical(numbers[0])

  const label = trimmed.toLowerCase().replace(/\s+/g, ' ')
  return NUMBER_WORDS[label] ?? label.slice(0, MAX_LABEL_LENGTH)
}
