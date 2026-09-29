import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChartFrame } from '@/components/charts/chart-frame'
import {
  SentimentTable,
  TermTable,
  TopicSentimentTable,
} from '@/components/charts/chart-tables'
// Recharts is loaded on demand; the sentiment bar is plain HTML and is not.
import { KeywordBar, TopicBar } from '@/components/charts/lazy-charts'
import { SENTIMENT_LABELS } from '@/components/charts/palette'
import { SentimentBar } from '@/components/charts/sentiment-bar'
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives'
import { DataConditionStrip } from '@/components/reports/data-condition-strip'
import { ExecutiveSummary } from '@/components/reports/executive-summary'
import { ExplorerFocusProvider } from '@/components/reports/explorer-focus'
import { InsightCards } from '@/components/reports/insight-cards'
import { ReportRealtime } from '@/components/reports/lazy-report-realtime'
import { ProvenanceStrip } from '@/components/reports/provenance-strip'
import { ReportHeader } from '@/components/reports/report-header'
import { ResponseExplorer } from '@/components/reports/response-explorer'
import { StatTile } from '@/components/reports/stat-tile'
import { TopicTail } from '@/components/reports/topic-tail'
import { Button } from '@/components/ui/button'
import { formatIdr, getJob, listJobResults } from '@/modules/analysis'
import { can, getPeople, getSessionUser } from '@/modules/auth'
import { getDataset } from '@/modules/ingestion'
import {
  OTHER_TOPIC_LABEL,
  buildDashboardData,
  getStoredSummary,
} from '@/modules/reporting'

export const metadata: Metadata = { title: 'Laporan' }

/** Enough topics to filter by without turning the chip row into a wall. */
const FILTERABLE_TOPICS = 12

/**
 * Section order is fixed by the design system (§6) and deliberately not the
 * order the data arrives in:
 *
 *   1 sticky header · 2 data condition · 3 executive summary · 4 insight cards
 *   5 charts · 6 topic disclosure · 7 response explorer · 8 provenance
 *
 * The reasoning behind it is worth keeping visible: the reader is told what the
 * data cannot support (2) *before* being told what it means (3, 4), and the raw
 * rows (7) sit above the provenance (8) so the last thing on the page is where
 * the numbers came from.
 */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const job = await getJob(id)
  if (!job.ok) notFound()

  const [results, session, dataset] = await Promise.all([
    listJobResults(id),
    getSessionUser(),
    getDataset(job.value.datasetId),
  ])

  const rows = results.ok ? results.value : []
  const data = buildDashboardData(rows)
  const datasetName = dataset.ok ? dataset.value.name : 'Dataset terhapus'

  const canExport = session.ok && can(session.value.role, 'report:export')
  // Regenerating spends the organization's OpenAI budget, so it is gated on the
  // same permission the endpoint checks rather than on a weaker read right.
  const canRegenerate = session.ok && can(session.value.role, 'analysis:run')
  const timezone = session.ok ? session.value.organizationTimezone : undefined
  // "Dijalankan oleh" in the provenance strip; read under RLS, so only a
  // colleague's name comes back.
  const runner = job.value.createdBy
    ? (await getPeople([job.value.createdBy])).get(job.value.createdBy)
    : undefined
  const runBy = runner?.displayName.trim()
    ? [runner.displayName.trim(), runner.title.trim()].filter(Boolean).join(' · ')
    : null

  if (rows.length === 0) {
    return (
      <section className="mx-auto max-w-narrative space-y-4">
        <h1 className="text-2xl font-semibold">Laporan</h1>
        <p className="text-sm text-muted-foreground">
          Job ini belum punya hasil analisis, jadi belum ada yang bisa dilaporkan.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/analysis/${job.value.id}`}>Lihat status analisis</Link>
        </Button>
      </section>
    )
  }

  const stored = await getStoredSummary(job.value.organizationId, job.value.id)

  /**
   * Only the quotes the insights actually cite. `rows` holds every response's
   * full text; InsightCards is a client component, so handing it the whole set
   * would serialise the dataset into the page payload a second time to satisfy
   * at most a dozen lookups.
   */
  const citedIds = new Set((stored?.insights ?? []).flatMap((i) => i.evidenceResponseIds))
  const citedQuotes: Record<string, string> = {}
  for (const row of rows) {
    if (citedIds.has(row.responseId)) citedQuotes[row.responseId] = row.responseText
  }

  const topThree = data.topics.slice(0, 3)

  /**
   * The "Lainnya" bucket is drawn as a bar like any other so the chart accounts
   * for every tagged mention. Appended last, it reads as the floor the ranked
   * topics sit on rather than competing with them for the top spot.
   */
  const topicRows = data.topicSentimentOther
    ? [...data.topicSentiment, data.topicSentimentOther]
    : data.topicSentiment

  const topicChartDescription = data.topicSentimentOther
    ? `Panjang batang menunjukkan berapa aspirasi menyebut topik itu; warnanya menunjukkan sentimennya. “Lainnya” menggabungkan ${data.topicTail.length} topik sisanya. Klik satu batang untuk menyaring tabel di bawah.`
    : 'Panjang batang menunjukkan berapa aspirasi menyebut topik itu; warnanya menunjukkan sentimennya. Klik satu batang untuk menyaring tabel di bawah.'

  return (
    <ExplorerFocusProvider>
      <ReportRealtime
        jobId={job.value.id}
        organizationId={job.value.organizationId}
        currentStatus={job.value.status}
      />

      {/* ── 1. Sticky report header ─────────────────────────────────── */}
      <ReportHeader
        jobId={job.value.id}
        datasetId={job.value.datasetId}
        datasetName={datasetName}
        status={job.value.status}
        totalResponses={data.sentiment.total}
        canExport={canExport}
      />

      <div className="mx-auto max-w-wide space-y-12 pt-8">
        {/* ── 2. Data condition strip ───────────────────────────────── */}
        <DataConditionStrip
          analyzed={data.sentiment.total}
          failed={job.value.failedCount}
          untagged={data.untaggedCount}
          isPartial={job.value.status === 'partial'}
        />

        {/* ── 3. Executive summary ──────────────────────────────────── */}
        <Reveal>
          <ExecutiveSummary
            jobId={job.value.id}
            summary={stored?.summary ?? null}
            generatedAt={stored?.createdAt ?? null}
            canRegenerate={canRegenerate}
            timeZone={timezone}
          />
        </Reveal>

        {/* ── 4. Insight cards ──────────────────────────────────────── */}
        <InsightCards insights={stored?.insights ?? []} quotes={citedQuotes} />

        {/* ── 5. Charts ─────────────────────────────────────────────── */}
        <section aria-labelledby="charts-heading" className="space-y-6">
          <h2 id="charts-heading" className="sr-only">
            Grafik
          </h2>

          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StaggerItem>
              <StatTile label="Total aspirasi" value={data.sentiment.total} />
            </StaggerItem>
            <StaggerItem>
              <StatTile
                label="Positif"
                value={data.sentiment.shares.positive}
                format="percent"
                detail={`${data.sentiment.counts.positive} aspirasi`}
                focus={{ sentiments: ['positive'] }}
              />
            </StaggerItem>
            <StaggerItem>
              <StatTile
                label="Negatif"
                value={data.sentiment.shares.negative}
                format="percent"
                detail={`${data.sentiment.counts.negative} aspirasi`}
                focus={{ sentiments: ['negative'] }}
              />
            </StaggerItem>
            <StaggerItem>
              <StatTile
                label="Kecenderungan"
                value={
                  data.sentiment.dominant
                    ? SENTIMENT_LABELS[data.sentiment.dominant]
                    : 'Seimbang'
                }
                detail={
                  topThree.length > 0
                    ? `Topik teratas: ${topThree.map((topic) => topic.term).join(', ')}`
                    : 'Belum ada topik terdeteksi'
                }
              />
            </StaggerItem>
          </Stagger>

          <Reveal>
            <ChartFrame
              title="Sebaran sentimen"
              description="Proporsi aspirasi negatif, netral, dan positif dari seluruh dataset. Klik satu bagian untuk menyaring tabel di bawah."
              table={<SentimentTable data={data.sentiment} />}
            >
              <SentimentBar data={data.sentiment} />
            </ChartFrame>
          </Reveal>

          <Reveal>
            <ChartFrame
              title={`Topik teratas (${data.topicSentiment.length} dari ${data.distinctTopicCount})`}
              description={topicChartDescription}
              empty={data.topicSentiment.length === 0}
              emptyMessage="Model tidak menandai satu pun topik pada dataset ini."
              table={<TopicSentimentTable rows={topicRows} />}
            >
              <TopicBar
                rows={topicRows}
                otherTopics={data.topicTail.map((topic) => topic.term)}
                otherLabel={data.topicSentimentOther ? OTHER_TOPIC_LABEL : undefined}
              />
            </ChartFrame>
          </Reveal>

          <Reveal>
            <ChartFrame
              title={`Kata kunci teratas (${data.keywords.length})`}
              description="Kata yang paling sering muncul di seluruh aspirasi. Klik satu batang untuk mencarinya di tabel di bawah."
              empty={data.keywords.length === 0}
              emptyMessage="Model tidak menandai satu pun kata kunci pada dataset ini."
              table={<TermTable terms={data.keywords} header="Kata kunci" />}
            >
              <KeywordBar keywords={data.keywords} />
            </ChartFrame>
          </Reveal>
        </section>

        {/* ── 6. Topic disclosure ───────────────────────────────────── */}
        <TopicTail topics={data.topicTail} />

        {/* ── 7. Response explorer ──────────────────────────────────── */}
        <ResponseExplorer
          rows={rows}
          topics={data.topics.slice(0, FILTERABLE_TOPICS).map((topic) => topic.term)}
        />

        {/* ── 8. Provenance strip ───────────────────────────────────── */}
        <ProvenanceStrip
          modelId={job.value.modelId}
          promptVersion={job.value.promptVersion}
          summaryGeneratedAt={stored?.createdAt ?? null}
          analyzedAt={job.value.createdAt}
          runBy={runBy}
          timeZone={timezone}
          analyzed={data.sentiment.total}
          cost={job.value.costMicroIdr > 0 ? formatIdr(job.value.costMicroIdr) : null}
          datasetName={datasetName}
        />
      </div>
    </ExplorerFocusProvider>
  )
}
