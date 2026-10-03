import type { QuestionMode } from '@/types/domain'

/**
 * A report is split by question (pilot 01, §4.4): "Apa yang perlu diperbaiki?"
 * and "Apa yang paling berkesan?" are two reports that share a cover. Pooling
 * their answers puts "konsumsi" from a complaint and "konsumsi" from a
 * compliment in one bar, and a topic chart that means neither.
 */
export type ReportQuestion = {
  id: string
  /** What the respondent was asked; the section's title. */
  text: string
  /**
   * How the job read the question, and so what its section draws: a question
   * with no sentiment in it gets no sentiment chart (ADR-0016).
   */
  mode: QuestionMode
}

export type QuestionSection<Row> = {
  question: ReportQuestion
  rows: Row[]
}

/** The title of a section whose question the report cannot name. */
export const UNKNOWN_QUESTION_TEXT = 'Pertanyaan lain'

/**
 * Splits results into one section per question, in the order the questions are
 * given — the order of the sheet's columns.
 *
 * A question with no results keeps its section: every answer to it may have
 * been "tidak ada", and a report that silently drops the question would hide
 * exactly that. Results that name a question the list does not have are kept
 * too, under a section of their own, rather than vanishing from the report.
 */
export function groupByQuestion<Row extends { questionId: string }>(
  rows: readonly Row[],
  questions: readonly ReportQuestion[],
): QuestionSection<Row>[] {
  const byQuestion = new Map<string, Row[]>(
    questions.map((question) => [question.id, []]),
  )
  const strays: Row[] = []

  for (const row of rows) {
    const bucket = byQuestion.get(row.questionId)
    if (bucket) bucket.push(row)
    else strays.push(row)
  }

  const sections = questions.map((question) => ({
    question,
    rows: byQuestion.get(question.id) ?? [],
  }))

  return strays.length > 0
    ? [
        ...sections,
        {
          question: { id: '', text: UNKNOWN_QUESTION_TEXT, mode: 'evaluative' as const },
          rows: strays,
        },
      ]
    : sections
}
