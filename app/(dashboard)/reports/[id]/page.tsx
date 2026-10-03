import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Reveal } from '@/components/motion/primitives'
import { DataConditionStrip } from '@/components/reports/data-condition-strip'
import { ExecutiveSummary } from '@/components/reports/executive-summary'
import { ExplorerFocusProvider, ExplorerScope } from '@/components/reports/explorer-focus'
import { InsightCards } from '@/components/reports/insight-cards'
import { ReportRealtime } from '@/components/reports/lazy-report-realtime'
import { ProvenanceStrip } from '@/components/reports/provenance-strip'
import { QuestionCharts } from '@/components/reports/question-charts'
import { ReportHeader } from '@/components/reports/report-header'
import { ResponseExplorer } from '@/components/reports/response-explorer'
import { Button } from '@/components/ui/button'
import {
  formatIdr,
  getJob,
  listJobResults,
  questionNoContent,
  separatesNoContent,
} from '@/modules/analysis'
import { can, getPeople, getSessionUser } from '@/modules/auth'
import { getDataset, listQuestions } from '@/modules/ingestion'
import {
  buildDashboardData,
  getStoredSummary,
  groupByQuestion,
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
 * A dataset with several questions repeats 5 and 6 once per question, under
 * the question as its heading: answers to different questions are never drawn
 * into one chart (pilot 01, §4.4).
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

  const session = await getSessionUser()
  if (!session.ok) redirect('/login')
  const { organizationId } = session.value

  const job = await getJob(organizationId, id)
  if (!job.ok) notFound()

  const [results, dataset, questions] = await Promise.all([
    listJobResults(organizationId, id),
    getDataset(organizationId, job.value.datasetId),
    listQuestions(organizationId, job.value.datasetId),
  ])

  const rows = results.ok ? results.value : []
  // The whole job: what the header, the data-condition strip and the
  // explorer's topic chips speak about. The charts are drawn per question.
  const data = buildDashboardData(rows)
  const datasetName = dataset.ok ? dataset.value.name : 'Dataset terhapus'

  const sections = groupByQuestion(
    rows,
    (questions.ok ? questions.value : []).map((question) => ({
      id: question.id,
      text: question.questionText,
    })),
  )
  const manyQuestions = sections.length > 1

  const canExport = can(session.value.role, 'report:export')
  // Regenerating spends the organization's OpenAI budget, so it is gated on the
  // same permission the endpoint checks rather than on a weaker read right.
  const canRegenerate = can(session.value.role, 'analysis:run')
  const timezone = session.value.organizationTimezone
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

  // "tidak ada" and friends: never in `rows`, so never in a percentage below.
  const noContent = separatesNoContent(job.value.promptVersion)
    ? job.value.noContentCount
    : null

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
        noContent={noContent}
        questionCount={sections.length}
        canExport={canExport}
      />

      <div className="mx-auto max-w-wide space-y-12 pt-8">
        {/* ── 2. Data condition strip ───────────────────────────────── */}
        <DataConditionStrip
          analyzed={data.sentiment.total}
          failed={job.value.failedCount}
          untagged={data.untaggedCount}
          noContent={noContent}
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
            questionCount={sections.length}
          />
        </Reveal>

        {/* ── 4. Insight cards ──────────────────────────────────────── */}
        <InsightCards insights={stored?.insights ?? []} quotes={citedQuotes} />

        {/* ── 5 and 6. Charts and topic disclosure, per question ────── */}
        {manyQuestions ? (
          sections.map((section, index) => {
            const sectionNoContent = questionNoContent(
              job.value,
              section.question.id,
              sections.length,
            )
            const headingId = `question-${index + 1}`

            return (
              <section
                key={section.question.id || headingId}
                aria-labelledby={headingId}
                className="space-y-6 border-t pt-10"
              >
                <header className="space-y-1">
                  <p className="eyebrow text-muted-foreground">
                    Pertanyaan {index + 1} dari {sections.length}
                  </p>
                  <h2 id={headingId} className="text-xl font-semibold md:text-2xl">
                    {section.question.text}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {sectionNoContent
                      ? `${section.rows.length} dari ${section.rows.length + sectionNoContent} jawaban berisi aspirasi`
                      : `${section.rows.length} jawaban dianalisis`}
                  </p>
                </header>

                {section.rows.length === 0 ? (
                  <p className="rounded-card border bg-card px-4 py-6 text-sm text-muted-foreground">
                    Tidak ada aspirasi untuk pertanyaan ini: jawabannya kosong, “tidak
                    ada”, atau gagal dianalisis.
                  </p>
                ) : (
                  <ExplorerScope questionId={section.question.id}>
                    <QuestionCharts data={buildDashboardData(section.rows)} />
                  </ExplorerScope>
                )}
              </section>
            )
          })
        ) : (
          <section aria-labelledby="charts-heading">
            <h2 id="charts-heading" className="sr-only">
              Grafik
            </h2>
            <QuestionCharts data={data} />
          </section>
        )}

        {/* ── 7. Response explorer ──────────────────────────────────── */}
        <ResponseExplorer
          rows={rows}
          topics={data.topics.slice(0, FILTERABLE_TOPICS).map((topic) => topic.term)}
          questions={sections.map((section) => section.question)}
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
