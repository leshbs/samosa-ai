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
  sentiment: Sentiment
  confidence: number
  topics: readonly string[]
  keywords: readonly string[]
}

/**
 * One row per aspiration, for the reader who wants to sort and pivot it
 * themselves. Semicolons join the multi-value columns: a comma inside a cell is
 * legal but turns every topic list into a quoting puzzle in a spreadsheet.
 */
export function exportResponsesToCsv(rows: readonly ExportableResponse[]): string {
  const table: Array<Array<string | number>> = [
    ['response', 'sentiment', 'sentiment_score', 'topics', 'keywords'],
    ...rows.map((row) => [
      row.responseText,
      row.sentiment,
      row.confidence.toFixed(2),
      row.topics.join('; '),
      row.keywords.join('; '),
    ]),
  ]

  return UTF8_BOM + toCsv(table)
}

export type ExportableDatasetRow = {
  id: string
  text: string
  respondentMeta: Record<string, string | number | boolean | null>
}

/**
 * A dataset as it was stored: the aspiration plus whichever columns the
 * uploader chose to keep. For the organization archive — the portable form of
 * the data, readable without SAMOSA. Columns are the union across rows, in
 * first-seen order, so a sheet whose later rows gained a column still lines up.
 */
export function exportDatasetToCsv(rows: readonly ExportableDatasetRow[]): string {
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
    ['response_id', 'response', ...metaColumns],
    ...rows.map((row) => [
      row.id,
      row.text,
      ...metaColumns.map((key) => {
        const value = row.respondentMeta[key]
        return value === null || value === undefined ? '' : String(value)
      }),
    ]),
  ]

  return UTF8_BOM + toCsv(table)
}
