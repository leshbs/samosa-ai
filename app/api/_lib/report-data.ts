import { formatIdr, getJob, listJobResults, separatesNoContent } from '@/modules/analysis'
import {
  getOrganizationSettings,
  getPeople,
  readOrganizationLogo,
  type LogoImage,
  type SessionUser,
} from '@/modules/auth'
import { getDataset } from '@/modules/ingestion'
import {
  aggregateKeywords,
  aggregateTopics,
  aggregateSentiment,
  getStoredSummary,
  topResponsesByTopic,
  type ReportDocumentData,
} from '@/modules/reporting'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { AnalysisResultRow } from '@/modules/analysis'
import { formatDateTime } from '@/lib/utils'
import {
  DEFAULT_REPORT_PREFERENCES,
  type OrgTimeZone,
  type ReportPreferences,
} from '@/types/domain'

/** Topics deep enough to be worth a section, shallow enough to stay readable. */
const TOPICS_IN_EXPORT = 10
const KEYWORDS_IN_EXPORT = 12
const TOPICS_WITH_QUOTES = 5
/** Every topic, for the optional tail; the cap only guards the arithmetic. */
const ALL_TOPICS = 10_000

export type ReportExportBundle = {
  rows: AnalysisResultRow[]
  document: ReportDocumentData
  /** Retention archived it: printable, but no longer reachable in the app. */
  archived: boolean
}

/**
 * What every export from one organization shares. Loaded once per request.
 */
export type ExportContext = {
  /** The active workspace; every read below is filtered to it. */
  organizationId: string
  organizationName: string
  timezone: OrgTimeZone
  preferences: ReportPreferences
  logo: LogoImage | null
  preparedBy: { name: string; title: string } | null
}

export async function loadExportContext(
  session: SessionUser,
  options: { logo: boolean } = { logo: true },
): Promise<ExportContext> {
  const [settings, logo] = await Promise.all([
    getOrganizationSettings(session.organizationId),
    // The CSV has nowhere to put a logo; do not download one for it.
    options.logo ? readOrganizationLogo(session.organizationId) : null,
  ])

  return {
    organizationId: session.organizationId,
    organizationName: session.organizationName,
    timezone: session.organizationTimezone,
    // Report defaults that cannot be read fall back to what the report always
    // printed, rather than failing a download the reader needs tonight.
    preferences: settings.ok
      ? settings.value.reportPreferences
      : DEFAULT_REPORT_PREFERENCES,
    logo,
    preparedBy: session.displayName.trim()
      ? { name: session.displayName.trim(), title: session.title.trim() }
      : null,
  }
}

/**
 * Text of the responses the summary's insights cite, by response id. Both
 * layouts of the report print them under the insight they support.
 */
export function citedQuotes(bundle: ReportExportBundle): Record<string, string> {
  const cited = new Set(bundle.document.insights.flatMap((i) => i.evidenceResponseIds))
  const quotes: Record<string, string> = {}
  for (const row of bundle.rows) {
    if (cited.has(row.responseId)) quotes[row.responseId] = row.responseText
  }
  return quotes
}

/** Embedded in the page rather than signed: a printout must not expire. */
function logoDataUrl(logo: LogoImage | null): string | null {
  if (!logo) return null
  const mime = logo.format === 'jpg' ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${Buffer.from(logo.data).toString('base64')}`
}

function personLine(person: { displayName: string; title: string } | undefined) {
  if (!person?.displayName.trim()) return null
  return person.title.trim()
    ? `${person.displayName.trim()} · ${person.title.trim()}`
    : person.displayName.trim()
}

/**
 * Assembles everything an export needs, once, from the modules that own each
 * piece. The print page and the CSV route want the same bundle, and neither is
 * the place to be joining four queries.
 *
 * Reads go through the session client, so RLS decides what this user may
 * export — an id from another tenant comes back as "not found", and so does
 * one from the requester's other workspace.
 */
export async function loadReportExport(
  jobId: string,
  context: ExportContext,
  options: { includeArchived?: boolean } = {},
): Promise<Result<ReportExportBundle, AppError>> {
  const { organizationId } = context
  // Together, not one after the other: both are keyed by the same two ids and
  // both go through RLS, and "Unduh PDF" waits on this read with a spinner.
  const [job, results] = await Promise.all([
    getJob(organizationId, jobId, options),
    listJobResults(organizationId, jobId),
  ])
  if (!job.ok) return job
  if (!results.ok) return results
  if (results.value.length === 0) {
    return err(
      appError(ERROR_CODES.NOT_FOUND, 'Analisis ini belum punya hasil untuk diekspor'),
    )
  }

  const [dataset, summary, people] = await Promise.all([
    getDataset(organizationId, job.value.datasetId, options),
    getStoredSummary(organizationId, jobId),
    getPeople([job.value.createdBy]),
  ])

  const rows = results.value
  const allTopics = aggregateTopics(rows, ALL_TOPICS)
  const topics = allTopics.slice(0, TOPICS_IN_EXPORT)
  const runBy = job.value.createdBy ? personLine(people.get(job.value.createdBy)) : null

  return ok({
    rows,
    archived: job.value.archivedAt !== null,
    document: {
      organizationName: context.organizationName,
      datasetName: dataset.ok ? dataset.value.name : 'Dataset',
      generatedAt: formatDateTime(job.value.createdAt, context.timezone),
      promptVersion: job.value.promptVersion,
      summary: summary?.summary ?? null,
      insights: summary?.insights ?? [],
      sentiment: aggregateSentiment(rows),
      noContent: separatesNoContent(job.value.promptVersion)
        ? job.value.noContentCount
        : null,
      topics,
      keywords: aggregateKeywords(rows, KEYWORDS_IN_EXPORT),
      topResponsesByTopic: topResponsesByTopic(rows, topics.slice(0, TOPICS_WITH_QUOTES)),
      logoSrc: logoDataUrl(context.logo),
      preparedBy: context.preparedBy,
      preferences: context.preferences,
      topicTail: allTopics.slice(TOPICS_IN_EXPORT),
      provenance: {
        modelId: job.value.modelId,
        promptVersion: job.value.promptVersion,
        analyzedAt: formatDateTime(
          job.value.finishedAt ?? job.value.createdAt,
          context.timezone,
        ),
        analyzed: rows.length,
        failed: job.value.failedCount,
        runBy,
        cost: job.value.costMicroIdr > 0 ? formatIdr(job.value.costMicroIdr) : null,
      },
    },
  })
}
