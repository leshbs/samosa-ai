import {
  DEFAULT_REPORT_PREFERENCES,
  type ReportInsight,
  type ReportPreferences,
} from '@/types/domain'
import type { TopicQuotes } from '../aggregators/quotes'
import type { SentimentDistribution } from '../aggregators/sentiment'
import type { CountedTerm } from '../aggregators/types'

/**
 * The printable report: what `/reports/[id]/print` lays out and the browser
 * turns into a PDF. It replaced a server-side PDF renderer that timed out on
 * Vercel during pilot 01 (docs/research/pilot-01-findings.md §2.2).
 */
export type ReportDocumentData = {
  organizationName: string
  datasetName: string
  generatedAt: string
  promptVersion: string
  summary: string | null
  insights: ReportInsight[]
  sentiment: SentimentDistribution
  /**
   * Respondents who gave no aspiration ("tidak ada", "-"). Out of every
   * percentage above. Null when the job predates the count.
   */
  noContent: number | null
  topics: CountedTerm[]
  keywords: CountedTerm[]
  topResponsesByTopic: TopicQuotes[]
  /** Printed beside the organization name, as a data: URL. */
  logoSrc?: string | null
  /** The person exporting, with the free-text title from their profile. */
  preparedBy?: { name: string; title: string } | null
  /** The organization's report defaults (checklist 5.5); absent means defaults. */
  preferences?: ReportPreferences
  /** Topics past the top ten, printed only when the tail is switched on. */
  topicTail?: CountedTerm[]
  provenance?: ReportProvenance | null
}

/**
 * The "Asal data" block. Everything is pre-formatted by the caller, which
 * knows the organization's timezone; the document only lays it out.
 */
export type ReportProvenance = {
  modelId: string
  promptVersion: string
  analyzedAt: string
  analyzed: number
  failed: number
  /** "Rani Putri · Sekretaris OSIS 2026/2027", or null when not recorded. */
  runBy: string | null
  cost: string | null
}

/** Bounded output: a 50-topic report is unreadable long before it is slow. */
const MAX_TOPICS = 10
const MAX_KEYWORDS = 12
const MAX_QUOTE_TOPICS = 5
const MAX_QUOTES_PER_TOPIC = 3
const MAX_QUOTE_LENGTH = 260

export type PrintableReport = {
  topics: CountedTerm[]
  keywords: CountedTerm[]
  quoted: TopicQuotes[]
  tail: CountedTerm[]
  provenance: ReportProvenance | null
  /** "Dianalisis" facts in print order, with the optional ones dropped. */
  provenanceFacts: Array<[string, string]>
}

export function truncateQuote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= MAX_QUOTE_LENGTH
    ? clean
    : `${clean.slice(0, MAX_QUOTE_LENGTH)}...`
}

/**
 * Applies the organization's report defaults and the length caps, so the page
 * only lays out what is left. The document's size is bounded by the number of
 * topics, not responses: a 5,000-row dataset prints the same few pages as a
 * 50-row one.
 */
export function printableReport(data: ReportDocumentData): PrintableReport {
  const preferences = data.preferences ?? DEFAULT_REPORT_PREFERENCES
  const provenance = preferences.includeProvenance ? (data.provenance ?? null) : null

  const provenanceFacts: Array<[string, string]> = []
  if (provenance) {
    provenanceFacts.push(
      ['Dataset', data.datasetName],
      ['Aspirasi dianalisis', String(provenance.analyzed)],
    )
    if (data.noContent) provenanceFacts.push(['Tanpa aspirasi', String(data.noContent)])
    if (provenance.failed > 0) {
      provenanceFacts.push(['Gagal dianalisis', String(provenance.failed)])
    }
    provenanceFacts.push(
      ['Model', provenance.modelId || 'tidak tercatat'],
      ['Versi prompt', provenance.promptVersion],
      ['Dianalisis', provenance.analyzedAt],
    )
    if (provenance.runBy) provenanceFacts.push(['Dijalankan oleh', provenance.runBy])
    if (provenance.cost) provenanceFacts.push(['Perkiraan biaya', provenance.cost])
  }

  return {
    topics: data.topics.slice(0, MAX_TOPICS),
    keywords: data.keywords.slice(0, MAX_KEYWORDS),
    quoted: preferences.includeQuotes
      ? data.topResponsesByTopic.slice(0, MAX_QUOTE_TOPICS).map((group) => ({
          topic: group.topic,
          responses: group.responses
            .slice(0, MAX_QUOTES_PER_TOPIC)
            .map((response) => ({ ...response, text: truncateQuote(response.text) })),
        }))
      : [],
    tail: preferences.includeTopicTail ? (data.topicTail ?? []) : [],
    provenance,
    provenanceFacts,
  }
}

/** Quotes printed under one insight: enough to show it is grounded, no more. */
const MAX_QUOTES_PER_INSIGHT = 2

/**
 * Everything the browser needs to draw the downloaded PDF, as plain JSON. The
 * defaults and length caps are already applied here, on the server, so the
 * drawing code decides nothing about content — it and the print page cannot
 * disagree about what a report contains, only about how it looks.
 */
export type ReportPdfPayload = {
  fileName: string
  organizationName: string
  datasetName: string
  generatedAt: string
  promptVersion: string
  summary: string | null
  insights: Array<{ title: string; detail: string; quotes: string[] }>
  sentiment: SentimentDistribution
  noContent: number | null
  logoSrc: string | null
  /** "Disiapkan oleh Rani Putri · Sekretaris OSIS", or null. */
  preparedLine: string | null
  view: PrintableReport
}

export function reportPdfPayload(
  data: ReportDocumentData,
  /** Text of the responses the insights cite, by response id. */
  quotes: Record<string, string>,
): ReportPdfPayload {
  const prepared = data.preparedBy
  return {
    fileName: `${reportFileStem(data.datasetName)}.pdf`,
    organizationName: data.organizationName,
    datasetName: data.datasetName,
    generatedAt: data.generatedAt,
    promptVersion: data.promptVersion,
    summary: data.summary,
    insights: data.insights.map((insight) => ({
      title: insight.title,
      detail: insight.detail,
      quotes: insight.evidenceResponseIds
        .map((id) => quotes[id])
        .filter((text): text is string => Boolean(text))
        .slice(0, MAX_QUOTES_PER_INSIGHT)
        .map(truncateQuote),
    })),
    sentiment: data.sentiment,
    noContent: data.noContent,
    logoSrc: data.logoSrc ?? null,
    preparedLine: prepared?.name
      ? `Disiapkan oleh ${prepared.name}${prepared.title ? ` · ${prepared.title}` : ''}`
      : null,
    view: printableReport(data),
  }
}

/**
 * The browser names a saved PDF after the page title, so the title is the
 * file name: readable and sortable in a downloads folder.
 */
export function reportFileStem(datasetName: string): string {
  const slug =
    datasetName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'laporan'
  return `samosa-${slug}`
}
