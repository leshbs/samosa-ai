import {
  DEFAULT_REPORT_PREFERENCES,
  type ReportInsight,
  type ReportPreferences,
} from '@/types/domain'
import type { TopicQuotes } from '../aggregators/quotes'
import type { SentimentDistribution } from '../aggregators/sentiment'
import type { CountedTerm } from '../aggregators/types'

/**
 * The printable report: what `/reports/[id]/print` lays out and what the
 * downloaded PDF draws. It replaced a server-side PDF renderer that timed out
 * on Vercel during pilot 01 (docs/research/pilot-01-findings.md §2.2).
 */
export type ReportDocumentData = {
  organizationName: string
  datasetName: string
  generatedAt: string
  promptVersion: string
  summary: string | null
  insights: ReportInsight[]
  /** Every question together: the cover line's count, nothing else. */
  sentiment: SentimentDistribution
  /**
   * Answers that held no aspiration ("tidak ada", "-"), across the job. Out of
   * every percentage. Null when the job predates the count.
   */
  noContent: number | null
  /**
   * One per question, in sheet order. Never pooled: a topic chart over two
   * questions means neither (pilot 01, §4.4).
   */
  sections: ReportDocumentSection[]
  /** Printed beside the organization name, as a data: URL. */
  logoSrc?: string | null
  /** The person exporting, with the free-text title from their profile. */
  preparedBy?: { name: string; title: string } | null
  /** The organization's report defaults (checklist 5.5); absent means defaults. */
  preferences?: ReportPreferences
  provenance?: ReportProvenance | null
}

export type ReportDocumentSection = {
  /** What the respondent was asked. */
  questionText: string
  sentiment: SentimentDistribution
  /** This question's non-answers; null when they were never counted. */
  noContent: number | null
  topics: CountedTerm[]
  keywords: CountedTerm[]
  topResponsesByTopic: TopicQuotes[]
  /** Topics past the top ten, printed only when the tail is switched on. */
  topicTail?: CountedTerm[]
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

export type PrintableSection = {
  /**
   * The question, printed over the section. Null when the report has one
   * question: its only section needs no heading, and the document reads as it
   * did before questions existed.
   */
  title: string | null
  /** "127 dari 181 jawaban berisi aspirasi"; null with the title. */
  countLine: string | null
  sentiment: SentimentDistribution
  noContent: number | null
  topics: CountedTerm[]
  keywords: CountedTerm[]
  quoted: TopicQuotes[]
  tail: CountedTerm[]
}

export type PrintableReport = {
  /** The line under the title: how much was analysed, in the reader's terms. */
  countLine: string
  sections: PrintableSection[]
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
 * "128 dari 140 responden memberikan aspirasi" for one question. With several,
 * a stored row is an answer rather than a respondent — one person gave several
 * — so the line counts answers and says how many questions they span.
 */
export function reportCountLine(
  analyzed: number,
  noContent: number | null,
  questionCount: number,
): string {
  if (questionCount > 1) {
    return noContent
      ? `${questionCount} pertanyaan · ${analyzed} dari ${analyzed + noContent} jawaban berisi aspirasi`
      : `${questionCount} pertanyaan · ${analyzed} jawaban dianalisis`
  }
  return noContent
    ? `${analyzed} dari ${analyzed + noContent} responden memberikan aspirasi`
    : `${analyzed} aspirasi`
}

function sectionCountLine(analyzed: number, noContent: number | null): string {
  return noContent
    ? `${analyzed} dari ${analyzed + noContent} jawaban berisi aspirasi`
    : `${analyzed} jawaban dianalisis`
}

/**
 * Applies the organization's report defaults and the length caps, so a layout
 * only lays out what is left. The document's size is bounded by the number of
 * questions and topics, not responses: a 5,000-row dataset prints the same few
 * pages as a 50-row one.
 */
export function printableReport(data: ReportDocumentData): PrintableReport {
  const preferences = data.preferences ?? DEFAULT_REPORT_PREFERENCES
  const provenance = preferences.includeProvenance ? (data.provenance ?? null) : null
  const many = data.sections.length > 1

  const provenanceFacts: Array<[string, string]> = []
  if (provenance) {
    provenanceFacts.push(['Dataset', data.datasetName])
    if (many) provenanceFacts.push(['Pertanyaan', String(data.sections.length)])
    provenanceFacts.push(['Aspirasi dianalisis', String(provenance.analyzed)])
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
    countLine: reportCountLine(
      data.sentiment.total,
      data.noContent,
      data.sections.length,
    ),
    sections: data.sections.map((section) => ({
      title: many ? section.questionText : null,
      countLine: many
        ? sectionCountLine(section.sentiment.total, section.noContent)
        : null,
      sentiment: section.sentiment,
      noContent: section.noContent,
      topics: section.topics.slice(0, MAX_TOPICS),
      keywords: section.keywords.slice(0, MAX_KEYWORDS),
      quoted: preferences.includeQuotes
        ? section.topResponsesByTopic.slice(0, MAX_QUOTE_TOPICS).map((group) => ({
            topic: group.topic,
            responses: group.responses
              .slice(0, MAX_QUOTES_PER_TOPIC)
              .map((response) => ({ ...response, text: truncateQuote(response.text) })),
          }))
        : [],
      tail: preferences.includeTopicTail ? (section.topicTail ?? []) : [],
    })),
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
