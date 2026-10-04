import {
  SENTIMENT_COLORS,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
} from '@/components/charts/palette'
import { printableReport, truncateQuote } from '@/modules/reporting'
import type {
  CountedTerm,
  PrintableSection,
  ReportDocumentData,
} from '@/modules/reporting'
import type { SentimentDistribution } from '@/modules/reporting'

/**
 * The report as a document: what "Cetak" prints (pilot 01, §2.2). The browser
 * makes the paper, so it is exactly this page and it costs the server nothing.
 *
 * It is one of two paper layouts — components/reports/pdf/report-pdf.tsx draws
 * the downloaded PDF. Both lay out a `printableReport()`, so they cannot
 * disagree about what a report contains; a change to a section belongs in both.
 *
 * Plain HTML on purpose. No Recharts: a canvas or an animated SVG prints at
 * whatever frame it was on, and a bar that is a sized <div> prints exactly.
 * Every chart carries its numbers beside it, because paper has no hover and a
 * photocopy has no colour.
 *
 * The outer table is how the running header repeats: browsers print a <thead>
 * at the top of every page a table spans.
 */
export function PrintDocument({
  data,
  quotes,
}: {
  data: ReportDocumentData
  /** Text of the responses the insights cite, by response id. */
  quotes: Record<string, string>
}) {
  const view = printableReport(data)
  const prepared = data.preparedBy?.name
    ? `Disiapkan oleh ${data.preparedBy.name}${data.preparedBy.title ? ` · ${data.preparedBy.title}` : ''}`
    : null

  return (
    <table className="print-frame w-full border-collapse">
      <thead className="print-running">
        <tr>
          <td className="pb-4 text-[8pt] text-muted-foreground">
            SAMOSA · {data.organizationName} · {data.datasetName}
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="align-top">
            <article className="space-y-8 text-[10pt] leading-relaxed">
              <header className="space-y-5">
                <div className="flex items-center gap-3">
                  {data.logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing to a printout.
                    <img
                      src={data.logoSrc}
                      alt=""
                      className="size-10 shrink-0 object-contain"
                    />
                  ) : null}
                  <div>
                    <p className="text-[12pt] font-semibold">{data.organizationName}</p>
                    {prepared ? (
                      <p className="text-[9pt] text-muted-foreground">{prepared}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1 border-b pb-5">
                  <p className="font-mono text-[8pt] uppercase tracking-widest text-muted-foreground">
                    Laporan aspirasi
                  </p>
                  <h1 className="text-[22pt] font-semibold leading-tight">
                    {data.datasetName}
                  </h1>
                  <p className="text-[9pt] text-muted-foreground">
                    {view.countLine} · {data.generatedAt} · prompt {data.promptVersion}
                  </p>
                </div>
              </header>

              <Section title="Ringkasan eksekutif">
                {data.summary ? (
                  <p className="whitespace-pre-line">{data.summary}</p>
                ) : (
                  <p className="text-muted-foreground">
                    Laporan ini belum punya ringkasan AI. Angka dan grafik di bawah tetap
                    lengkap.
                  </p>
                )}

                {view.insights.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {view.insights.map((insight) => {
                      const cited = insight.evidenceResponseIds
                        .map((id) => quotes[id])
                        .filter((text): text is string => Boolean(text))
                        .slice(0, 2)
                      return (
                        <li key={insight.title} className="keep-together">
                          <p className="font-semibold">{insight.title}</p>
                          {insight.origin ? (
                            <p className="text-[8pt] text-muted-foreground">
                              Dari pertanyaan: {insight.origin}
                            </p>
                          ) : null}
                          <p className="text-muted-foreground">{insight.detail}</p>
                          {cited.map((text, index) => (
                            <blockquote
                              key={index}
                              className="mt-1 border-l-2 pl-2 text-[9pt] italic text-muted-foreground"
                            >
                              “{truncateQuote(text)}”
                            </blockquote>
                          ))}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </Section>

              {view.sections.map((section, index) => (
                <QuestionSections
                  key={index}
                  section={section}
                  position={index + 1}
                  count={view.sections.length}
                />
              ))}

              {view.provenance ? (
                <Section title="Asal data" keepTogether>
                  <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-0.5 text-[9pt]">
                    {view.provenanceFacts.map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[9pt] text-muted-foreground">
                    Sentimen, topik, dan kata kunci dihasilkan model bahasa dan bisa
                    salah. Setiap angka bisa dilacak ke{' '}
                    {view.aspirations ? 'aspirasi' : 'jawaban'} aslinya di SAMOSA.
                  </p>
                </Section>
              ) : null}
            </article>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * Everything the report says about one question. With one question there is
 * no heading over it, and the document reads as it did before questions
 * existed; with several, each opens with what the respondent was asked.
 */
function QuestionSections({
  section,
  position,
  count,
}: {
  section: PrintableSection
  position: number
  count: number
}) {
  const total = section.answers
  const evaluative = section.mode === 'evaluative'
  const choices = section.mode === 'categorical'

  return (
    <>
      {section.title ? (
        // The rule and the eyebrow mark a new question, not a new chart; kept
        // with the first chart so a question never ends a page as a bare title.
        <header className="print-heading space-y-1 border-t pt-6">
          <p className="font-mono text-[8pt] uppercase tracking-widest text-muted-foreground">
            Pertanyaan {position} dari {count}
          </p>
          <h2 className="text-[15pt] font-semibold leading-snug">{section.title}</h2>
          {section.countLine ? (
            <p className="text-[9pt] text-muted-foreground">{section.countLine}</p>
          ) : null}
        </header>
      ) : null}

      {total === 0 ? (
        <p className="text-muted-foreground">
          {evaluative
            ? 'Tidak ada aspirasi untuk pertanyaan ini: jawabannya kosong, “tidak ada”, atau gagal dianalisis.'
            : 'Tidak ada jawaban yang bisa dipakai untuk pertanyaan ini: jawabannya kosong atau gagal dianalisis.'}
        </p>
      ) : (
        <>
          {/* Only a question that asks for a judgement has a sentiment to print. */}
          {evaluative ? (
            <SentimentSection
              sentiment={section.sentiment}
              noContent={section.noContent}
            />
          ) : null}

          {section.scale ? (
            <Section title={section.termsTitle} keepTogether>
              {section.scaleLine ? <p className="mb-2">{section.scaleLine}</p> : null}
              <BarList terms={section.scale.values} total={total} />
              {section.scale.otherCount > 0 ? (
                <p className="mt-2 text-[9pt] text-muted-foreground">
                  {section.scale.otherCount} jawaban dengan nilai yang jarang muncul tidak
                  digambar.
                </p>
              ) : null}
            </Section>
          ) : null}

          {section.topics.length > 0 ? (
            <Section title={section.termsTitle} keepTogether>
              <BarList terms={section.topics} total={total} />
              {section.mergeNote ? (
                <p className="mt-2 text-[9pt] text-muted-foreground">
                  {section.mergeNote}
                </p>
              ) : null}
            </Section>
          ) : null}

          {section.tail.length > 0 ? (
            <Section
              title={`${choices ? 'Pilihan' : 'Topik'} lainnya (${section.tail.length})`}
            >
              <p className="mb-2 text-muted-foreground">
                {choices ? 'Pilihan' : 'Topik'} di luar sepuluh besar, dengan jumlah{' '}
                {evaluative ? 'aspirasi' : 'jawaban'} yang menyebutnya.
              </p>
              <ul className="columns-2 gap-6 text-[9pt]">
                {section.tail.map((term) => (
                  <li key={term.term} className="flex justify-between gap-2">
                    <span>{term.term}</span>
                    <span className="tabular-nums">{term.count}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {section.keywords.length > 0 ? (
            <Section title="Kata kunci teratas" keepTogether>
              <BarList terms={section.keywords} total={total} />
            </Section>
          ) : null}

          {section.quoted.length > 0 ? (
            <Section title={`Contoh ${evaluative ? 'aspirasi' : 'jawaban'} per topik`}>
              <div className="space-y-4">
                {section.quoted.map((group) => (
                  <div key={group.topic} className="keep-together">
                    <p className="mb-1 font-semibold">{group.topic}</p>
                    {group.responses.map((response, index) => (
                      <blockquote
                        key={index}
                        className="mb-1 border-l-2 pl-2 text-[9pt] text-muted-foreground"
                      >
                        {response.text}
                        {response.sentiment
                          ? ` (${SENTIMENT_LABELS[response.sentiment]})`
                          : null}
                      </blockquote>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  )
}

function Section({
  title,
  keepTogether = false,
  children,
}: {
  title: string
  /** For short sections that look broken when split across a page. */
  keepTogether?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={keepTogether ? 'keep-together' : undefined}>
      {/* break-after: avoid keeps a heading from being stranded at a page foot. */}
      <h2 className="print-heading mb-2 text-[13pt] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function SentimentSection({
  sentiment,
  noContent,
}: {
  sentiment: SentimentDistribution
  noContent: number | null
}) {
  return (
    <Section title="Sentimen" keepTogether>
      <div className="mb-3 flex gap-4 text-[9pt] text-muted-foreground">
        {SENTIMENT_ORDER.map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-sm"
              style={{ backgroundColor: SENTIMENT_COLORS[key] }}
            />
            {SENTIMENT_LABELS[key]}
          </span>
        ))}
      </div>

      {/* 2px of paper between segments — a gap, never a stroke of ink. */}
      <div className="mb-3 flex h-3.5 gap-0.5">
        {SENTIMENT_ORDER.filter((key) => sentiment.counts[key] > 0).map((key) => (
          <div
            key={key}
            className="h-full rounded-sm"
            style={{
              width: percent(sentiment.shares[key]),
              backgroundColor: SENTIMENT_COLORS[key],
            }}
          />
        ))}
      </div>

      {/* The table is the reading of that bar for a black-and-white copier. */}
      <table className="w-full max-w-sm text-[9pt]">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 font-medium">Sentimen</th>
            <th className="py-1 text-right font-medium">Jumlah</th>
            <th className="py-1 text-right font-medium">Porsi</th>
          </tr>
        </thead>
        <tbody>
          {SENTIMENT_ORDER.map((key) => (
            <tr key={key}>
              <td className="py-0.5">{SENTIMENT_LABELS[key]}</td>
              <td className="py-0.5 text-right tabular-nums">{sentiment.counts[key]}</td>
              <td className="py-0.5 text-right tabular-nums">
                {percent(sentiment.shares[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {noContent ? (
        <p className="mt-2 text-[9pt] text-muted-foreground">
          {noContent} responden tidak memberikan aspirasi (misalnya menjawab “tidak ada”).
          Mereka tidak dihitung di persentase ini.
        </p>
      ) : null}
    </Section>
  )
}

/**
 * Magnitude, so one hue and no legend — the section title names the series.
 * Every bar carries its own value.
 */
function BarList({ terms, total }: { terms: CountedTerm[]; total: number }) {
  // Not the first term's: a scale's bars are in value order, not count order.
  const max = Math.max(0, ...terms.map((term) => term.count))

  return (
    <ul className="space-y-1.5 text-[9pt]">
      {terms.map((term) => (
        <li
          key={term.term}
          className="grid grid-cols-[10rem_1fr_5rem] items-center gap-2"
        >
          <span className="truncate">{term.term}</span>
          <span className="h-2.5 rounded-sm bg-[var(--chart-grid)]">
            <span
              className="block h-full rounded-sm bg-[var(--chart-series-1)]"
              style={{ width: max === 0 ? '0%' : `${(term.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {term.count} · {total === 0 ? '0%' : percent(term.count / total)}
          </span>
        </li>
      ))}
    </ul>
  )
}
