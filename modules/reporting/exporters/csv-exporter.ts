import type { Report, Sentiment } from '@/types/domain'

/** RFC 4180 quoting: double the quotes, wrap whenever a delimiter can appear. */
function escapeCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\n')
}

/** BOM so Excel on Windows opens the file as UTF-8 instead of ANSI. */
const UTF8_BOM = '﻿'

export function exportReportToCsv(report: Report): string {
  const rows: Array<Array<string | number>> = [
    ['section', 'key', 'value', 'count'],
    ['summary', 'text', report.summary, ''],
  ]

  for (const [sentiment, count] of Object.entries(report.sentimentCounts)) {
    rows.push(['sentiment', sentiment, '', count])
  }

  for (const topic of report.topics) {
    rows.push(['topic', topic.topic, topic.share.toFixed(4), topic.count])
  }

  for (const insight of report.insights) {
    rows.push([
      'insight',
      insight.title,
      insight.detail,
      insight.evidenceResponseIds.length,
    ])
  }

  return UTF8_BOM + toCsv(rows)
}

export type ExportableResponse = {
  responseText: string
  /** Null where the question was not read for sentiment: an empty cell. */
  sentiment: Sentiment | null
  confidence: number | null
  topics: readonly string[]
  /** The labels before the job's topic merge; absent means the same as `topics`. */
  rawTopics?: readonly string[]
  keywords: readonly string[]
  questionId?: string
  /** The sheet row, counted from 0. */
  respondentIndex?: number
}

/**
 * A question as a CSV names it: by what the respondent was asked, and by how
 * the report read it.
 */
export type ExportableQuestion = { id: string; text: string; mode?: string }

/**
 * One row per aspiration, for the reader who wants to sort and pivot it
 * themselves. Semicolons join the multi-value columns: a comma inside a cell is
 * legal but turns every topic list into a quoting puzzle in a spreadsheet.
 *
 * `question`, `respondent` and `mode` come last, so the five columns a
 * spreadsheet built on the earlier export refers to by position stay where
 * they were. `respondent` is the row of the uploaded sheet, counted from 1:
 * the same number on every answer one person gave. `mode` says how the
 * question was read, which is what explains an empty `sentiment`: only an
 * `evaluative` question has one, and for a `categorical` or `scale` question
 * `topics` holds the choice or the value the answer gave.
 *
 * `topics` is what the report counts: labels the job found to name one thing
 * are written as that one topic (ADR-0018). `topics_raw`, last for the same
 * reason as the others, is each answer's labels as the model gave them, so the
 * merge can be checked or undone in a spreadsheet.
 */
export function exportResponsesToCsv(
  rows: readonly ExportableResponse[],
  questions: readonly ExportableQuestion[] = [],
): string {
  const byId = new Map(questions.map((question) => [question.id, question]))

  const table: Array<Array<string | number>> = [
    [
      'response',
      'sentiment',
      'sentiment_score',
      'topics',
      'keywords',
      'question',
      'respondent',
      'mode',
      'topics_raw',
    ],
    ...rows.map((row) => {
      const question = byId.get(row.questionId ?? '')
      return [
        row.responseText,
        row.sentiment ?? '',
        row.confidence === null ? '' : row.confidence.toFixed(2),
        row.topics.join('; '),
        row.keywords.join('; '),
        question?.text ?? '',
        row.respondentIndex === undefined ? '' : row.respondentIndex + 1,
        question?.mode ?? '',
        (row.rawTopics ?? row.topics).join('; '),
      ]
    }),
  ]

  return UTF8_BOM + toCsv(table)
}

export type ExportableDatasetRow = {
  id: string
  text: string
  questionId?: string
  /** The sheet row, counted from 0. */
  respondentIndex?: number
  respondentMeta: Record<string, string | number | boolean | null>
}

/**
 * A dataset as it was stored: the aspiration plus whichever columns the
 * uploader chose to keep. For the organization archive — the portable form of
 * the data, readable without SAMOSA. Columns are the union across rows, in
 * first-seen order, so a sheet whose later rows gained a column still lines up.
 *
 * One row per answer, as stored. `question` and `respondent` are what put the
 * sheet back together: answers with the same respondent number were one row.
 */
export function exportDatasetToCsv(
  rows: readonly ExportableDatasetRow[],
  questions: readonly ExportableQuestion[] = [],
): string {
  const textOf = new Map(questions.map((question) => [question.id, question.text]))
  const metaColumns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.respondentMeta)) {
      if (!seen.has(key)) {
        seen.add(key)
        metaColumns.push(key)
      }
    }
  }

  const table: Array<Array<string | number>> = [
    ['response_id', 'response', 'question', 'respondent', ...metaColumns],
    ...rows.map((row) => [
      row.id,
      row.text,
      textOf.get(row.questionId ?? '') ?? '',
      row.respondentIndex === undefined ? '' : row.respondentIndex + 1,
      ...metaColumns.map((key) => {
        const value = row.respondentMeta[key]
        return value === null || value === undefined ? '' : String(value)
      }),
    ]),
  ]

  return UTF8_BOM + toCsv(table)
}
