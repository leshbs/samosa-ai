import type { AnalysisMode } from '@/types/domain'
import type { ColumnDescription } from '../prompts'

/**
 * The guess at a column's mode without a model: what the wizard shows when the
 * model does not answer, and what settles the columns that never need asking.
 * Pure, so the local adapter and the tests can use it without a network.
 */

/** A header that is a label, not a question: "Kelas", "Nama Lengkap", "No. HP". */
const MAX_LABEL_WORDS = 4

/** Labels that ask who the respondent is, or that are bookkeeping. */
const IDENTITY =
  /\b(nama|name|e-?mail|surel|no\.?\s*(hp|wa|telp|telepon|absen|induk)|nomor\s*(hp|wa|telepon|absen|induk)|whatsapp|nis|nisn|nim|npm|nik|timestamp|cap waktu|skor|score|alamat)\b/i

/** Labels that describe the respondent rather than ask them something. */
const ATTRIBUTE =
  /\b(kelas|angkatan|jurusan|prodi|program studi|fakultas|divisi|jabatan|jenis kelamin|gender|usia|umur|asal sekolah)\b/i

/** Headers that ask for a judgement. */
const JUDGEMENT =
  /\b(kritik|saran|masukan|keluhan|aspirasi|feedback|pendapat\w*|komentar|evaluasi|kesan|pesan|uneg\W?uneg|penilaian|perbaik\w*|kekurangan|kendala)\b/i

/**
 * Whether a header names feedback outright: "Aspirasi", "Kritik dan saran",
 * "Masukan untuk OSIS". Such a column is `evaluative` whatever else is guessed
 * for it — reading complaints without their sentiment is the costlier mistake,
 * and the one the model makes when a header is a bare label (measured: six of
 * eight such headers came back `thematic`).
 */
export function asksForJudgement(header: string): boolean {
  return JUDGEMENT.test(header)
}

function isLabel(header: string): boolean {
  return header.trim().split(/\s+/).length <= MAX_LABEL_WORDS
}

/**
 * A column its cells alone settle, so its header is not even sent to the
 * model: dates, email addresses and phone numbers are bookkeeping whatever the
 * header says, and an empty column is nothing.
 */
export function modeSettledByShape(column: ColumnDescription): AnalysisMode | null {
  return column.kind === 'date' ||
    column.kind === 'email' ||
    column.kind === 'phone' ||
    column.kind === 'empty'
    ? 'ignore'
    : null
}

/**
 * Header words first, then the shape of the cells.
 *
 * Deliberately cautious about free text. A long-text column whose header says
 * nothing recognisable is called `evaluative` — what every column was before
 * modes — rather than `thematic`: an unneeded sentiment chart is the failure
 * people already know how to read.
 */
export function guessModeByRule(column: ColumnDescription): AnalysisMode {
  const settled = modeSettledByShape(column)
  if (settled) return settled

  // "Nama kegiatan yang paling seru menurutmu?" contains "nama" and is not an
  // identity column; a label of a few words that does is.
  if (isLabel(column.header) && column.kind !== 'long_text') {
    if (IDENTITY.test(column.header)) return 'ignore'
    if (ATTRIBUTE.test(column.header)) return 'segment'
  }

  if (column.kind === 'number') return 'scale'
  if (column.kind === 'long_text') return 'evaluative'
  if (JUDGEMENT.test(column.header)) return 'evaluative'

  // Short text. Many repeats is a set of choices; almost none is a column of
  // names or codes that no header gave away.
  const repeats = column.filled > 0 ? 1 - column.distinct / column.filled : 0
  if (column.filled >= 5 && repeats >= 0.5) return 'categorical'
  return column.averageWords < 2 ? 'ignore' : 'evaluative'
}
