import { formatIdr, getJob, listJobResults } from '@/modules/analysis'
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
}

/**
 * What every export from one organization shares. Loaded once, so the
 * archive's twenty reports read the logo once, not twenty times.
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
    // Report defaults that cannot be read fall back to what the PDF always
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

function personLine(person: { displayName: string; title: string } | undefined) {
  if (!person?.displayName.trim()) return null
  return person.title.trim()
    ? `${person.displayName.trim()} · ${person.title.trim()}`
    : person.displayName.trim()
}

/**
 * Assembles everything an export needs, once, from the modules that own each
 * piece. Both download routes want the same bundle, and a route handler is the
 * wrong place to be joining four queries twice.
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
  const job = await getJob(organizationId, jobId, options)
  if (!job.ok) return job

  const results = await listJobResults(organizationId, jobId)
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
    document: {
      organizationName: context.organizationName,
      datasetName: dataset.ok ? dataset.value.name : 'Dataset',
      generatedAt: formatDateTime(job.value.createdAt, context.timezone),
      promptVersion: job.value.promptVersion,
      summary: summary?.summary ?? null,
      insights: summary?.insights ?? [],
      sentiment: aggregateSentiment(rows),
      topics,
      keywords: aggregateKeywords(rows, KEYWORDS_IN_EXPORT),
      topResponsesByTopic: topResponsesByTopic(rows, topics.slice(0, TOPICS_WITH_QUOTES)),
      logo: context.logo,
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
