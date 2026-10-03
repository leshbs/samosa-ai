import {
  DEFAULT_REPORT_PREFERENCES,
  type QuestionMode,
  type ReportInsight,
  type ReportPreferences,
} from '@/types/domain'
import type { TopicQuotes } from '../aggregators/quotes'
import type { ScaleSummary } from '../aggregators/scale'
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
  /** Answers with a result, every question together: the cover line's count. */
  answers: number
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
  /** The question's id, so an insight can name the section it comes from. */
  questionId?: string
  /** What the respondent was asked. */
  questionText: string
  /**
   * How the job read the question (ADR-0016). It decides what the section
   * prints: only `evaluative` has a sentiment block; `categorical` and `scale`
   * print counts of what was answered rather than topics.
   */
  mode: QuestionMode
  /** Answers with a result. */
  answers: number
  sentiment: SentimentDistribution
  /** This question's non-answers; null when they were never counted. */
  noContent: number | null
  /** Topics — or, for a `categorical` question, the choices named. */
  topics: CountedTerm[]
  keywords: CountedTerm[]
  topResponsesByTopic: TopicQuotes[]
  /** Topics past the top ten, printed only when the tail is switched on. */
  topicTail?: CountedTerm[]
  /** Only for a `scale` question. */
  scale?: ScaleSummary | null
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
  mode: QuestionMode
  /** Answers with a result: the denominator of every bar that is not a sentiment. */
  answers: number
  sentiment: SentimentDistribution
  noContent: number | null
  /** The heading over `topics`: what the bars count, in the reader's word. */
  termsTitle: string
  topics: CountedTerm[]
  keywords: CountedTerm[]
  quoted: TopicQuotes[]
  tail: CountedTerm[]
  /** Only for a `scale` question: its bars are `scale.values`, not `topics`. */
  scale: ScaleSummary | null
  /**
   * That question's mean and most common value as one sentence. Written here
   * rather than by the layouts: the PDF is drawn in the browser, which must
   * not import this module to format it.
   */
  scaleLine: string | null
}

export type PrintableInsight = {
  title: string
  detail: string
  /** The question it comes from, when the report has several and it names one. */
  origin: string | null
  evidenceResponseIds: string[]
}

export type PrintableReport = {
  /** The line under the title: how much was analysed, in the reader's terms. */
  countLine: string
  /**
   * Whether every question asked for a judgement. When one did not, the
   * document says "jawaban" where it would say "aspirasi".
   */
  aspirations: boolean
  insights: PrintableInsight[]
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
 *
 * `aspirations` is false when a question of the report is not `evaluative`:
 * a choice or a number is an answer, not an aspiration, and the line says
 * "jawaban" throughout.
 */
export function reportCountLine(
  analyzed: number,
  noContent: number | null,
  questionCount: number,
  aspirations: boolean = true,
): string {
  if (questionCount > 1) {
    if (!noContent) return `${questionCount} pertanyaan · ${analyzed} jawaban dianalisis`
    return aspirations
      ? `${questionCount} pertanyaan · ${analyzed} dari ${analyzed + noContent} jawaban berisi aspirasi`
      : `${questionCount} pertanyaan · ${analyzed} dari ${analyzed + noContent} jawaban dianalisis`
  }
  if (!aspirations) {
    return noContent
      ? `${analyzed} dari ${analyzed + noContent} responden menjawab`
      : `${analyzed} jawaban`
  }
  return noContent
    ? `${analyzed} dari ${analyzed + noContent} responden memberikan aspirasi`
    : `${analyzed} aspirasi`
}

/** The line under a question's title, in a report with several. */
export function sectionCountLine(
  analyzed: number,
  noContent: number | null,
  mode: QuestionMode = 'evaluative',
): string {
  if (!noContent) return `${analyzed} jawaban dianalisis`
  return mode === 'evaluative'
    ? `${analyzed} dari ${analyzed + noContent} jawaban berisi aspirasi`
    : `${analyzed} dari ${analyzed + noContent} jawaban dianalisis`
}

/** What a section's bars count, as their heading says it. */
export const TERMS_TITLES: Record<QuestionMode, string> = {
  evaluative: 'Topik teratas',
  thematic: 'Topik teratas',
  categorical: 'Pilihan jawaban',
  scale: 'Sebaran jawaban',
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
  const aspirations = data.sections.every((section) => section.mode === 'evaluative')

  const provenanceFacts: Array<[string, string]> = []
  if (provenance) {
    provenanceFacts.push(['Dataset', data.datasetName])
    if (many) provenanceFacts.push(['Pertanyaan', String(data.sections.length)])
    provenanceFacts.push([
      aspirations ? 'Aspirasi dianalisis' : 'Jawaban dianalisis',
      String(provenance.analyzed),
    ])
    if (data.noContent) {
      provenanceFacts.push([
        aspirations ? 'Tanpa aspirasi' : 'Tidak berisi jawaban',
        String(data.noContent),
      ])
    }
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

  const titleOf = new Map(
    data.sections
      .filter((section) => section.questionId)
      .map((section) => [section.questionId, section.questionText]),
  )

  return {
    aspirations,
    countLine: reportCountLine(
      data.answers,
      data.noContent,
      data.sections.length,
      aspirations,
    ),
    insights: data.insights.map((insight) => ({
      title: insight.title,
      detail: insight.detail,
      // With one question there is nothing to tell apart.
      origin:
        many && insight.questionId ? (titleOf.get(insight.questionId) ?? null) : null,
      evidenceResponseIds: insight.evidenceResponseIds,
    })),
    sections: data.sections.map((section) => {
      const prose = section.mode === 'evaluative' || section.mode === 'thematic'
      return {
        title: many ? section.questionText : null,
        countLine: many
          ? sectionCountLine(section.answers, section.noContent, section.mode)
          : null,
        mode: section.mode,
        answers: section.answers,
        sentiment: section.sentiment,
        noContent: section.noContent,
        termsTitle: TERMS_TITLES[section.mode],
        topics: section.mode === 'scale' ? [] : section.topics.slice(0, MAX_TOPICS),
        // A choice or a number has no keywords and nothing to quote: the
        // answer is the value already counted above.
        keywords: prose ? section.keywords.slice(0, MAX_KEYWORDS) : [],
        quoted:
          prose && preferences.includeQuotes
            ? section.topResponsesByTopic.slice(0, MAX_QUOTE_TOPICS).map((group) => ({
                topic: group.topic,
                responses: group.responses
                  .slice(0, MAX_QUOTES_PER_TOPIC)
                  .map((response) => ({
                    ...response,
                    text: truncateQuote(response.text),
                  })),
              }))
            : [],
        tail:
          section.mode !== 'scale' && preferences.includeTopicTail
            ? (section.topicTail ?? [])
            : [],
        scale: section.mode === 'scale' ? (section.scale ?? null) : null,
        scaleLine:
          section.mode === 'scale' && section.scale ? scaleLine(section.scale) : null,
      }
    }),
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
  insights: Array<{
    title: string
    detail: string
    origin: string | null
    quotes: string[]
  }>
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
  const view = printableReport(data)
  return {
    fileName: `${reportFileStem(data.datasetName)}.pdf`,
    organizationName: data.organizationName,
    datasetName: data.datasetName,
    generatedAt: data.generatedAt,
    promptVersion: data.promptVersion,
    summary: data.summary,
    insights: view.insights.map((insight) => ({
      title: insight.title,
      detail: insight.detail,
      origin: insight.origin,
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
    view,
  }
}

/** A mean as an Indonesian reader writes it: "4,25". */
export function formatMean(mean: number): string {
  return mean.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

/**
 * The two figures of a `scale` section as one line, for the layouts that have
 * no tiles: "Rata-rata 4,2 dari 180 jawaban berupa angka · paling sering 4 (72
 * jawaban)".
 */
function scaleLine(scale: ScaleSummary): string {
  const mean =
    scale.mean === null
      ? 'Tidak ada jawaban berupa angka, jadi tidak ada rata-rata'
      : `Rata-rata ${formatMean(scale.mean)} dari ${scale.numericAnswers} jawaban berupa angka`
  return scale.mostCommon
    ? `${mean} · paling sering ${scale.mostCommon} (${scale.mostCommonCount} jawaban)`
    : mean
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
