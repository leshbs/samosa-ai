import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { ReportInsight, Sentiment } from '@/types/domain'
import type { TopicQuotes } from '../aggregators/quotes'
import type { SentimentDistribution } from '../aggregators/sentiment'
import type { CountedTerm } from '../aggregators/types'

export type PdfExport = {
  bytes: Uint8Array
  fileName: string
}

export type ReportDocumentData = {
  organizationName: string
  datasetName: string
  generatedAt: string
  promptVersion: string
  summary: string | null
  insights: ReportInsight[]
  sentiment: SentimentDistribution
  topics: CountedTerm[]
  keywords: CountedTerm[]
  topResponsesByTopic: TopicQuotes[]
}

/**
 * Literal hex rather than the `var(--chart-*)` tokens the web charts use: a PDF
 * has no stylesheet and no theme to follow. These are the light-theme values
 * from app/globals.css, so a printed report and the screen it came from show
 * the same colours. Paper is always light.
 */
const COLORS = {
  positive: '#2a78d6',
  neutral: '#c3c2b7',
  negative: '#e34948',
  series: '#2a78d6',
  ink: '#1c1b19',
  muted: '#6b6963',
  rule: '#e1e0d9',
  track: '#f2f1ec',
} as const

const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: 'Positif',
  neutral: 'Netral',
  negative: 'Negatif',
}

/** Worst to best, matching the diverging scale on screen. */
const SENTIMENT_ORDER: readonly Sentiment[] = ['negative', 'neutral', 'positive']

/** Bounded output: a 50-topic report is unreadable long before it is slow. */
const MAX_TOPICS = 10
const MAX_KEYWORDS = 12
const MAX_QUOTE_TOPICS = 5
const MAX_QUOTES_PER_TOPIC = 3
const MAX_QUOTE_LENGTH = 260

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLORS.ink,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  coverEyebrow: { fontSize: 9, color: COLORS.muted, letterSpacing: 1 },
  coverTitle: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    // Without an explicit line height the 24pt line box is shorter than the
    // glyphs, and the next line prints across this one's descenders.
    lineHeight: 1.25,
    marginBottom: 4,
  },
  coverMeta: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
  coverRule: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    marginTop: 20,
    marginBottom: 24,
  },

  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  section: { marginBottom: 26 },
  body: { fontSize: 10, lineHeight: 1.6 },
  muted: { color: COLORS.muted },

  insight: { marginBottom: 10 },
  insightTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },

  legendRow: { flexDirection: 'row', marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, marginRight: 5 },
  legendLabel: { fontSize: 9, color: COLORS.muted },

  // 2px of surface between segments - a gap, never a stroke of ink.
  stack: { flexDirection: 'row', height: 14, marginBottom: 10 },
  stackSegment: { height: 14, borderRadius: 2, marginRight: 2 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: 130, fontSize: 9, paddingRight: 8 },
  barTrack: { flex: 1, height: 10, backgroundColor: COLORS.track, borderRadius: 2 },
  barFill: { height: 10, borderRadius: 2, backgroundColor: COLORS.series },
  barValue: { width: 62, fontSize: 9, textAlign: 'right', color: COLORS.muted },

  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  tableCell: { fontSize: 9 },

  quoteTopic: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  quote: {
    fontSize: 9,
    color: COLORS.muted,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.rule,
    paddingLeft: 8,
    marginBottom: 5,
  },

  /**
   * Static children, positioned with `left` only.
   *
   * Three shapes of this footer each rendered nothing at all, silently: a flex
   * row inside an absolutely positioned box (no height to derive, collapses),
   * `left` together with `right` (does not stretch a box the way CSS would,
   * collapses the width), and the `render` prop, which is how react-pdf
   * supplies page numbers. The last one works in a minimal document and not in
   * this one; measured, not assumed, by rendering both side by side. So there
   * are no page numbers here — see docs/DEBT.md.
   */
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    fontSize: 8,
    color: COLORS.muted,
  },
})

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= MAX_QUOTE_LENGTH
    ? clean
    : `${clean.slice(0, MAX_QUOTE_LENGTH)}...`
}

function Section({
  title,
  children,
  wrap = true,
}: {
  title: string
  children: React.ReactNode
  /** Off for short sections that look broken when split across a page. */
  wrap?: boolean
}) {
  return (
    <View style={styles.section} wrap={wrap}>
      {/* Keeps a heading from being stranded as the last line of a page. */}
      <Text style={styles.sectionTitle} minPresenceAhead={48}>
        {title}
      </Text>
      {children}
    </View>
  )
}

/**
 * Magnitude, so one hue and no legend - the section title names the series.
 * Every bar carries its own value: print has no hover to fall back on.
 */
function BarList({ terms, total }: { terms: CountedTerm[]; total: number }) {
  const max = terms[0]?.count ?? 0

  return (
    <View>
      {terms.map((term) => (
        <View key={term.term} style={styles.barRow}>
          <Text style={styles.barLabel}>{term.term}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: max === 0 ? '0%' : `${(term.count / max) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.barValue}>
            {term.count} · {total === 0 ? '0%' : percent(term.count / total)}
          </Text>
        </View>
      ))}
    </View>
  )
}

function SentimentSection({ sentiment }: { sentiment: SentimentDistribution }) {
  const segments = SENTIMENT_ORDER.filter((key) => sentiment.counts[key] > 0)

  return (
    <Section title="Sentimen" wrap={false}>
      <View style={styles.legendRow}>
        {SENTIMENT_ORDER.map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: COLORS[key] }]} />
            <Text style={styles.legendLabel}>{SENTIMENT_LABELS[key]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.stack}>
        {segments.map((key) => (
          <View
            key={key}
            style={[
              styles.stackSegment,
              { backgroundColor: COLORS[key], width: percent(sentiment.shares[key]) },
            ]}
          />
        ))}
      </View>

      {/* The table is the accessible reading of that bar: the neutral segment is
          deliberately low-contrast, and a photocopied report loses hue entirely. */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCell, { width: 120 }]}>Sentimen</Text>
        <Text style={[styles.tableCell, { width: 70 }]}>Jumlah</Text>
        <Text style={styles.tableCell}>Porsi</Text>
      </View>
      {SENTIMENT_ORDER.map((key) => (
        <View key={key} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: 120 }]}>{SENTIMENT_LABELS[key]}</Text>
          <Text style={[styles.tableCell, { width: 70 }]}>{sentiment.counts[key]}</Text>
          <Text style={styles.tableCell}>{percent(sentiment.shares[key])}</Text>
        </View>
      ))}
    </Section>
  )
}

function ReportDocument({ data }: { data: ReportDocumentData }) {
  const topics = data.topics.slice(0, MAX_TOPICS)
  const keywords = data.keywords.slice(0, MAX_KEYWORDS)
  const quoted = data.topResponsesByTopic.slice(0, MAX_QUOTE_TOPICS)

  return (
    <Document
      title={`Laporan aspirasi - ${data.datasetName}`}
      author={data.organizationName}
      language="id"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverEyebrow}>LAPORAN ASPIRASI</Text>
        <Text style={styles.coverTitle}>{data.datasetName}</Text>
        <Text style={styles.coverMeta}>{data.organizationName}</Text>
        <Text style={styles.coverMeta}>
          {data.sentiment.total} aspirasi · {data.generatedAt} · prompt{' '}
          {data.promptVersion}
        </Text>
        <View style={styles.coverRule} />

        <Section title="Ringkasan eksekutif">
          {data.summary ? (
            <Text style={styles.body}>{data.summary}</Text>
          ) : (
            <Text style={[styles.body, styles.muted]}>
              Laporan ini belum punya ringkasan AI. Angka dan grafik di bawah tetap
              lengkap.
            </Text>
          )}

          {data.insights.length > 0 && (
            <View style={{ marginTop: 12 }}>
              {data.insights.map((insight) => (
                <View key={insight.title} style={styles.insight}>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <Text style={[styles.body, styles.muted]}>{insight.detail}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <SentimentSection sentiment={data.sentiment} />

        {topics.length > 0 && (
          <Section title="Topik teratas">
            <BarList terms={topics} total={data.sentiment.total} />
          </Section>
        )}

        {keywords.length > 0 && (
          <Section title="Kata kunci teratas">
            <BarList terms={keywords} total={data.sentiment.total} />
          </Section>
        )}

        {quoted.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contoh aspirasi per topik</Text>
            {quoted.map((group) => (
              <View key={group.topic} wrap={false}>
                <Text style={styles.quoteTopic}>{group.topic}</Text>
                {group.responses.slice(0, MAX_QUOTES_PER_TOPIC).map((response, index) => (
                  <Text key={`${group.topic}-${index}`} style={styles.quote}>
                    {truncate(response.text)} ({SENTIMENT_LABELS[response.sentiment]})
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          SAMOSA · {data.organizationName} · {data.datasetName}
        </Text>
      </Page>
    </Document>
  )
}

/** Filesystem-safe and readable, so a folder of downloads stays sortable. */
function fileNameFor(data: ReportDocumentData): string {
  const slug =
    data.datasetName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'laporan'
  return `samosa-${slug}.pdf`
}

/**
 * Renders the printable report.
 *
 * Everything here comes from aggregates plus a handful of quotes, so the
 * document's size is bounded by the number of topics rather than the number of
 * responses: a 5,000-row dataset produces the same few pages as a 50-row one.
 * That is why there is no "dataset too large" guard — the shape that would have
 * needed one does not exist.
 */
export async function exportReportToPdf(
  data: ReportDocumentData,
): Promise<Result<PdfExport, AppError>> {
  if (data.sentiment.total === 0) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'This job has no results to put in a report'),
    )
  }

  try {
    const buffer = await renderToBuffer(<ReportDocument data={data} />)
    return ok({ bytes: new Uint8Array(buffer), fileName: fileNameFor(data) })
  } catch (cause) {
    // The cause never reaches the client, so it has to be logged here or the
    // failure is a bare 500 with nothing to go on.
    logger.error('reporting.pdf.render_failed', { cause: String(cause) })
    return err(appError(ERROR_CODES.INTERNAL, 'Could not render the PDF', { cause }))
  }
}
