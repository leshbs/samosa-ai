import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChartFrame } from '@/components/charts/chart-frame'
import {
  SentimentTable,
  TermTable,
  TopicSentimentTable,
} from '@/components/charts/chart-tables'
import { KeywordBar } from '@/components/charts/keyword-bar'
import { SENTIMENT_LABELS } from '@/components/charts/palette'
import { SentimentBar } from '@/components/charts/sentiment-bar'
import { TopicBar } from '@/components/charts/topic-bar'
import { ExecutiveSummary } from '@/components/reports/executive-summary'
import { ReportRealtime } from '@/components/reports/report-realtime'
import { ResponseExplorer } from '@/components/reports/response-explorer'
import { StatTile } from '@/components/reports/stat-tile'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatPercent } from '@/lib/utils'
import { getJob, listJobResults } from '@/modules/analysis'
import { buildDashboardData, getStoredSummary } from '@/modules/reporting'

export const metadata: Metadata = { title: 'Laporan' }

/** Enough topics to filter by without turning the chip row into a wall. */
const FILTERABLE_TOPICS = 12

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const job = await getJob(id)
  if (!job.ok) notFound()

  const results = await listJobResults(id)
  const rows = results.ok ? results.value : []
  const data = buildDashboardData(rows)

  if (rows.length === 0) {
    return (
      <section className="space-y-4">
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
  const quotesById = new Map(rows.map((row) => [row.responseId, row.responseText]))

  const topThree = data.topics.slice(0, 3)

  return (
    <section className="space-y-8">
      <ReportRealtime
        jobId={job.value.id}
        organizationId={job.value.organizationId}
        currentStatus={job.value.status}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/analysis/${job.value.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Kembali ke analisis
          </Link>
          <h1 className="text-2xl font-semibold">Laporan aspirasi</h1>
          <p className="text-sm text-muted-foreground">
            {data.sentiment.total} aspirasi · dianalisis{' '}
            {formatDateTime(job.value.createdAt)} · prompt {job.value.promptVersion}
          </p>
        </div>

        {/* Plain links, not fetch(): a GET that returns a file is already a
            download, and routing it through JavaScript only adds a way to fail. */}
        <Button asChild size="sm">
          <a href={`/api/reports/${job.value.id}/pdf`} download>
            Export PDF
          </a>
        </Button>
      </div>

      <ExecutiveSummary
        jobId={job.value.id}
        summary={stored?.summary ?? null}
        insights={stored?.insights ?? []}
        generatedAt={stored?.createdAt ?? null}
        quotesById={quotesById}
      />

      {/* ── 1. Overview ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total aspirasi"
          value={String(data.sentiment.total)}
          detail={
            job.value.failedCount > 0
              ? `${job.value.failedCount} gagal dianalisis`
              : 'Semua berhasil dianalisis'
          }
        />
        <StatTile
          label="Positif"
          value={formatPercent(data.sentiment.shares.positive)}
          detail={`${data.sentiment.counts.positive} aspirasi`}
        />
        <StatTile
          label="Negatif"
          value={formatPercent(data.sentiment.shares.negative)}
          detail={`${data.sentiment.counts.negative} aspirasi`}
        />
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
      </div>

      {/* ── 2. Sentiment ────────────────────────────────────────────── */}
      <ChartFrame
        title="Sebaran sentimen"
        description="Proporsi aspirasi negatif, netral, dan positif dari seluruh dataset."
        table={<SentimentTable data={data.sentiment} />}
      >
        <SentimentBar data={data.sentiment} />
      </ChartFrame>

      {/* ── 3. Topics ───────────────────────────────────────────────── */}
      <ChartFrame
        title={`Topik teratas (${data.topicSentiment.length})`}
        description="Panjang batang menunjukkan berapa aspirasi menyebut topik itu; warnanya menunjukkan sentimennya."
        empty={data.topicSentiment.length === 0}
        emptyMessage="Model tidak menandai satu pun topik pada dataset ini."
        table={<TopicSentimentTable rows={data.topicSentiment} />}
      >
        <TopicBar rows={data.topicSentiment} />
      </ChartFrame>

      {/* ── 4. Keywords ─────────────────────────────────────────────── */}
      <ChartFrame
        title={`Kata kunci teratas (${data.keywords.length})`}
        description="Kata yang paling sering muncul di seluruh aspirasi."
        empty={data.keywords.length === 0}
        emptyMessage="Model tidak menandai satu pun kata kunci pada dataset ini."
        table={<TermTable terms={data.keywords} header="Kata kunci" />}
      >
        <KeywordBar keywords={data.keywords} />
      </ChartFrame>

      {data.untaggedCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {data.untaggedCount} aspirasi tidak mendapat topik apa pun dari model, jadi
          tidak terhitung di grafik topik di atas.
        </p>
      ) : null}

      {/* ── 5. Response explorer ────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/reports/${job.value.id}/csv`} download>
            Export CSV
          </a>
        </Button>
      </div>

      <ResponseExplorer
        rows={rows}
        topics={data.topics.slice(0, FILTERABLE_TOPICS).map((topic) => topic.term)}
      />
    </section>
  )
}
