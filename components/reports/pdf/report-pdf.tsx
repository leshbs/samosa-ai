import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer'
import { SENTIMENT_LABELS, SENTIMENT_ORDER } from '@/components/charts/palette'
import type {
  CountedTerm,
  PrintableSection,
  ReportPdfPayload,
  SentimentDistribution,
} from '@/modules/reporting'
import { mapStrings, printableText } from './printable-text'
import { rasterLogo } from './raster-logo'

/**
 * The downloaded PDF, drawn in the reader's browser (ADR-0014). Nothing here
 * runs on the server: this file is only ever reached through the `import()`
 * in download-pdf-button.tsx, so the library is fetched on the first click and
 * by nobody else.
 *
 * It is the second layout of the same report — components/reports/
 * print-document.tsx is the first. react-pdf reads neither HTML nor CSS, so the
 * two cannot share markup. What they share is the content: both lay out a
 * `printableReport()`, and neither decides what a report contains. A change to
 * a section belongs in both files.
 */

/** Millimetres to PDF points. */
const mm = (value: number) => (value * 72) / 25.4

/** The paper's margins, equal to `@page` in app/globals.css. */
const MARGIN_X = mm(25)
const MARGIN_Y = mm(22)
/** A4, in points. */
const PAGE_HEIGHT = mm(297)
/** Room under the running header, which sits on the top margin line. */
const HEADER_BAND = 24
const SECTION_GAP = 28

/**
 * Literal values rather than the `var(--…)` tokens the print page uses: a PDF
 * has no stylesheet. These are the light-theme values from `.print-doc` in
 * app/globals.css — paper is always light.
 */
const COLORS = {
  positive: '#3a9e8d',
  neutral: '#e8a63c',
  negative: '#be4a63',
  series: '#3a9e8d',
  track: '#ddd4c9',
  ink: '#1a1613',
  muted: '#7a6e64',
  rule: '#ddd4c9',
} as const

const FAMILY = 'Plus Jakarta Sans'

/** Every face the document sets text in. */
const FACES = [
  { file: 'PlusJakartaSans-Regular.ttf', fontWeight: 400, fontStyle: 'normal' },
  { file: 'PlusJakartaSans-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
  { file: 'PlusJakartaSans-SemiBold.ttf', fontWeight: 600, fontStyle: 'normal' },
] as const

let fontsRegistered = false

/**
 * The app's typeface, as static files in /public/fonts: react-pdf cannot read
 * the variable woff2 that next/font serves. Registered once per page load.
 *
 * `base` is where the files are: a URL path in the browser, a directory in the
 * unit test, which has no server to fetch from.
 */
function registerFonts(base: string) {
  if (fontsRegistered) return
  fontsRegistered = true
  Font.register({
    family: FAMILY,
    fonts: FACES.map(({ file, fontWeight, fontStyle }) => ({
      src: `${base}/${file}`,
      fontWeight,
      fontStyle,
    })),
  })
  // The built-in hyphenation is English: it breaks "konsumsi" where no
  // Indonesian reader would. Words wrap whole instead.
  Font.registerHyphenationCallback((word) => [word])
}

/**
 * Fetches and parses the font files. The render would do this anyway; doing it
 * by name lets the download button start it while the report's data is still
 * on its way, instead of after. Safe to call twice: a face loads once.
 */
export async function loadFaces(fontBase = '/fonts') {
  registerFonts(fontBase)
  return Promise.all(
    FACES.map(async ({ fontWeight, fontStyle }) => {
      const descriptor = { fontFamily: FAMILY, fontWeight, fontStyle }
      await Font.load(descriptor)
      return Font.getFont(descriptor).data
    }),
  )
}

/**
 * The report with every character the typeface cannot draw taken out (see
 * printable-text.ts). "Can it draw this?" is asked of the font files
 * themselves rather than of a list that could go stale.
 */
export async function drawableReport(
  report: ReportPdfPayload,
  fontBase = '/fonts',
): Promise<ReportPdfPayload> {
  const faces = await loadFaces(fontBase)
  const canDraw = (codePoint: number) =>
    faces.every((face) => face !== null && face.hasGlyphForCodePoint(codePoint))

  // The logo is a data: URL, not text: megabytes of base64 with nothing to drop.
  const { logoSrc, ...text } = report
  return { ...mapStrings(text, (value) => printableText(value, canDraw)), logoSrc }
}

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN_Y + HEADER_BAND,
    paddingBottom: MARGIN_Y,
    paddingHorizontal: MARGIN_X,
    fontFamily: FAMILY,
    fontSize: 10,
    lineHeight: 1.6,
    color: COLORS.ink,
    // The space between sections is a gap, not a bottom margin on each one.
    // react-pdf counts a block's bottom margin as part of what must fit: a
    // section that ended within its own margin of the page foot was moved to
    // the next page whole, leaving half a page empty behind it.
    gap: SECTION_GAP,
  },
  running: {
    position: 'absolute',
    top: MARGIN_Y,
    left: MARGIN_X,
    right: MARGIN_X,
    fontSize: 8,
    color: COLORS.muted,
  },
  // Placed from the top. A `render` text positioned with `bottom` is laid out
  // against the height of the whole unpaginated document: it is drawn on every
  // page, thousands of points above the paper, and the PDF simply shows no
  // page numbers (measured; this is what the old server exporter ran into).
  pageNumber: {
    position: 'absolute',
    top: PAGE_HEIGHT - MARGIN_Y / 2 - 5,
    left: MARGIN_X,
    right: MARGIN_X,
    fontSize: 8,
    textAlign: 'right',
    color: COLORS.muted,
  },

  letterhead: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  logo: { width: 40, height: 40, objectFit: 'contain', marginRight: 12 },
  organization: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 },
  prepared: { fontSize: 9, color: COLORS.muted, lineHeight: 1.3 },

  eyebrow: { fontSize: 8, letterSpacing: 1.4, color: COLORS.muted },
  // Without its own line height the 22pt line box is shorter than the glyphs,
  // and a wrapped title prints across its own descenders.
  title: { fontSize: 22, fontWeight: 600, lineHeight: 1.25, marginTop: 2 },
  meta: { fontSize: 9, color: COLORS.muted, marginTop: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.rule, marginTop: 20 },

  heading: { fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 },
  muted: { color: COLORS.muted },
  small: { fontSize: 9 },
  paragraph: { marginBottom: 8 },

  insight: { marginTop: 10 },
  insightTitle: { fontWeight: 600 },
  quote: {
    fontSize: 9,
    color: COLORS.muted,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.rule,
    paddingLeft: 7,
    marginTop: 4,
  },
  italic: { fontStyle: 'italic' },

  legend: { flexDirection: 'row', marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  swatch: { width: 7, height: 7, borderRadius: 2, marginRight: 5 },

  stack: { flexDirection: 'row', height: 12, marginBottom: 10 },
  // 2pt of paper between segments — a gap, never a stroke of ink.
  segment: { height: 12, borderRadius: 2, marginRight: 2 },

  table: { width: 270 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    paddingBottom: 2,
    marginBottom: 2,
  },
  row: { flexDirection: 'row' },
  cell: { fontSize: 9, flex: 1 },
  number: { fontSize: 9, width: 60, textAlign: 'right' },

  bar: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel: { width: 110, fontSize: 9, lineHeight: 1.3, paddingRight: 8 },
  barTrack: { flex: 1, height: 8, borderRadius: 2, backgroundColor: COLORS.track },
  barFill: { height: 8, borderRadius: 2, backgroundColor: COLORS.series },
  barValue: {
    width: 58,
    fontSize: 9,
    lineHeight: 1.3,
    textAlign: 'right',
    color: COLORS.muted,
  },

  questionRule: {
    borderTopWidth: 1,
    borderTopColor: COLORS.rule,
    paddingTop: 16,
    marginBottom: 14,
  },
  questionTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginTop: 2 },

  tailCell: { flex: 1, flexDirection: 'row' },
  tailGutter: { width: 24 },
  tailCount: { fontSize: 9, width: 30, textAlign: 'right' },

  quoteGroup: { marginBottom: 12 },
  fact: { flexDirection: 'row' },
  factLabel: { width: 110, fontSize: 9, color: COLORS.muted },
  factValue: { flex: 1, fontSize: 9 },
})

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function Heading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>
}

/** A short section that looks broken when split across a page: it moves whole. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Heading>{title}</Heading>
      {children}
    </View>
  )
}

/**
 * Magnitude, so one hue and no legend — the section title names the series.
 * Every bar carries its own value: paper has no hover.
 */
function BarList({ terms, total }: { terms: CountedTerm[]; total: number }) {
  const max = terms[0]?.count ?? 0

  return (
    <View>
      {terms.map((term) => (
        <View key={term.term} style={styles.bar}>
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

function TailCell({ term }: { term: CountedTerm | undefined }) {
  return (
    <View style={styles.tailCell}>
      {term ? (
        <>
          <Text style={styles.cell}>{term.term}</Text>
          <Text style={styles.tailCount}>{term.count}</Text>
        </>
      ) : null}
    </View>
  )
}

function SentimentBlock({
  sentiment,
  noContent,
}: {
  sentiment: SentimentDistribution
  noContent: number | null
}) {
  return (
    <>
      <Heading>Sentimen</Heading>
      <View style={styles.legend}>
        {SENTIMENT_ORDER.map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: COLORS[key] }]} />
            <Text style={[styles.small, styles.muted]}>{SENTIMENT_LABELS[key]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.stack}>
        {SENTIMENT_ORDER.filter((key) => sentiment.counts[key] > 0).map((key) => (
          <View
            key={key}
            style={[
              styles.segment,
              { backgroundColor: COLORS[key], flexGrow: sentiment.counts[key] },
            ]}
          />
        ))}
      </View>

      {/* The table is the reading of that bar for a black-and-white copier. */}
      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.cell, { fontWeight: 600 }]}>Sentimen</Text>
          <Text style={[styles.number, { fontWeight: 600 }]}>Jumlah</Text>
          <Text style={[styles.number, { fontWeight: 600 }]}>Porsi</Text>
        </View>
        {SENTIMENT_ORDER.map((key) => (
          <View key={key} style={styles.row}>
            <Text style={styles.cell}>{SENTIMENT_LABELS[key]}</Text>
            <Text style={styles.number}>{sentiment.counts[key]}</Text>
            <Text style={styles.number}>{percent(sentiment.shares[key])}</Text>
          </View>
        ))}
      </View>

      {noContent ? (
        <Text style={[styles.small, styles.muted, { marginTop: 8 }]}>
          {noContent} responden tidak memberikan aspirasi (misalnya menjawab “tidak ada”).
          Mereka tidak dihitung di persentase ini.
        </Text>
      ) : null}
    </>
  )
}

/**
 * Everything the report says about one question, as blocks that sit directly
 * on the page — a fragment adds no box, so the page's gap spaces them like any
 * other block.
 *
 * With one question there is no heading over it, and the document reads as it
 * did before questions existed. With several, each opens with what the
 * respondent was asked, in one unbreakable box with its first chart: a
 * question must not end a page as a bare title.
 */
function QuestionBlocks({
  section,
  position,
  count,
}: {
  section: PrintableSection
  position: number
  count: number
}) {
  const total = section.sentiment.total
  // Two columns, so a long tail costs half the pages; read down, then across.
  const half = Math.ceil(section.tail.length / 2)
  const tailRows = section.tail.slice(0, half).map((term, index) => ({
    left: term,
    right: section.tail[index + half],
  }))
  const [firstQuoted, ...otherQuoted] = section.quoted

  return (
    <>
      <View wrap={false}>
        {section.title ? (
          <View style={styles.questionRule}>
            <Text style={styles.eyebrow}>
              PERTANYAAN {position} DARI {count}
            </Text>
            <Text style={styles.questionTitle}>{section.title}</Text>
            {section.countLine ? (
              <Text style={styles.meta}>{section.countLine}</Text>
            ) : null}
          </View>
        ) : null}

        {total === 0 ? (
          <Text style={styles.muted}>
            Tidak ada aspirasi untuk pertanyaan ini: jawabannya kosong, “tidak ada”, atau
            gagal dianalisis.
          </Text>
        ) : (
          <SentimentBlock sentiment={section.sentiment} noContent={section.noContent} />
        )}
      </View>

      {total > 0 && section.topics.length > 0 ? (
        <Block title="Topik teratas">
          <BarList terms={section.topics} total={total} />
        </Block>
      ) : null}

      {total > 0 && tailRows.length > 0 ? (
        <View>
          <View wrap={false}>
            <Heading>{`Topik lainnya (${section.tail.length})`}</Heading>
            <Text style={[styles.muted, { marginBottom: 6 }]}>
              Topik di luar sepuluh besar, dengan jumlah aspirasi yang menyebutnya.
            </Text>
          </View>
          {tailRows.map((row) => (
            <View key={row.left.term} style={styles.row} wrap={false}>
              <TailCell term={row.left} />
              <View style={styles.tailGutter} />
              <TailCell term={row.right} />
            </View>
          ))}
        </View>
      ) : null}

      {total > 0 && section.keywords.length > 0 ? (
        <Block title="Kata kunci teratas">
          <BarList terms={section.keywords} total={total} />
        </Block>
      ) : null}

      {total > 0 && firstQuoted ? (
        <View>
          <View wrap={false}>
            <Heading>Contoh aspirasi per topik</Heading>
            <QuoteGroup group={firstQuoted} />
          </View>
          {otherQuoted.map((group) => (
            <View key={group.topic} wrap={false}>
              <QuoteGroup group={group} />
            </View>
          ))}
        </View>
      ) : null}
    </>
  )
}

export function ReportPdf({ report }: { report: ReportPdfPayload }) {
  const { view } = report
  const paragraphs = (report.summary ?? '').split(/\n+/).filter((text) => text.trim())

  /**
   * Where a long section may break across pages, its heading is kept with what
   * follows it by putting both in one unbreakable box. `minPresenceAhead` is
   * the documented way and was tried: it pushed whole sections to the next
   * page with half of this one still empty.
   */
  return (
    <Document
      title={`Laporan aspirasi - ${report.datasetName}`}
      author={report.organizationName}
      creator="SAMOSA"
      language="id"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.running} fixed>
          SAMOSA · {report.organizationName} · {report.datasetName}
        </Text>

        <View wrap={false}>
          <View style={styles.letterhead}>
            {report.logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image takes no alt; the name beside it is the text.
              <Image style={styles.logo} src={report.logoSrc} />
            ) : null}
            <View>
              <Text style={styles.organization}>{report.organizationName}</Text>
              {report.preparedLine ? (
                <Text style={styles.prepared}>{report.preparedLine}</Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.eyebrow}>LAPORAN ASPIRASI</Text>
          <Text style={styles.title}>{report.datasetName}</Text>
          <Text style={styles.meta}>
            {view.countLine} · {report.generatedAt} · prompt {report.promptVersion}
          </Text>
          <View style={styles.rule} />
        </View>

        <View>
          <Heading>Ringkasan eksekutif</Heading>
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>
              Laporan ini belum punya ringkasan AI. Angka dan grafik di bawah tetap
              lengkap.
            </Text>
          )}

          {report.insights.map((insight) => (
            <View key={insight.title} style={styles.insight} wrap={false}>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.muted}>{insight.detail}</Text>
              {insight.quotes.map((text, index) => (
                <Text key={index} style={[styles.quote, styles.italic]}>
                  “{text}”
                </Text>
              ))}
            </View>
          ))}
        </View>

        {view.sections.map((section, index) => (
          <QuestionBlocks
            key={index}
            section={section}
            position={index + 1}
            count={view.sections.length}
          />
        ))}

        {view.provenance ? (
          <Block title="Asal data">
            {view.provenanceFacts.map(([label, value]) => (
              <View key={label} style={styles.fact}>
                <Text style={styles.factLabel}>{label}</Text>
                <Text style={styles.factValue}>{value}</Text>
              </View>
            ))}
            <Text style={[styles.small, styles.muted, { marginTop: 8 }]}>
              Sentimen, topik, dan kata kunci dihasilkan model bahasa dan bisa salah.
              Setiap angka bisa dilacak ke aspirasi aslinya di SAMOSA.
            </Text>
          </Block>
        ) : null}

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

function QuoteGroup({ group }: { group: PrintableSection['quoted'][number] }) {
  return (
    <View style={styles.quoteGroup}>
      <Text style={styles.insightTitle}>{group.topic}</Text>
      {group.responses.map((response, index) => (
        <Text key={index} style={styles.quote}>
          {response.text} ({SENTIMENT_LABELS[response.sentiment]})
        </Text>
      ))}
    </View>
  )
}

/** Draws the report and returns the file, ready to hand to the browser. */
export async function renderReportPdf(report: ReportPdfPayload): Promise<Blob> {
  const [drawable, logoSrc] = await Promise.all([
    drawableReport(report),
    rasterLogo(report.logoSrc),
  ])
  return pdf(<ReportPdf report={{ ...drawable, logoSrc }} />).toBlob()
}
