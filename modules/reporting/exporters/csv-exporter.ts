import type { Report } from '@/types/domain'

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
