import { z } from 'zod'

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export const sentimentSchema = z.enum(SENTIMENTS)
export type Sentiment = z.infer<typeof sentimentSchema>

export const DATASET_SOURCES = ['csv', 'xlsx', 'google_forms', 'manual'] as const
export const datasetSourceSchema = z.enum(DATASET_SOURCES)
export type DatasetSource = z.infer<typeof datasetSourceSchema>

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  /** Some batches failed; the results that did land are still usable. */
  'partial',
  'failed',
  'cancelled',
] as const
export const jobStatusSchema = z.enum(JOB_STATUSES)
export type JobStatus = z.infer<typeof jobStatusSchema>

/**
 * A job with something to read. `partial` earns its place: some batches
 * failed, but the aspirations that did come back are still worth reading, and
 * the report says so at the top.
 */
export const REPORTABLE_STATUSES = [
  'succeeded',
  'partial',
] as const satisfies readonly JobStatus[]

export function isReportable(status: JobStatus): boolean {
  return (REPORTABLE_STATUSES as readonly JobStatus[]).includes(status)
}

export const ORG_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export const orgRoleSchema = z.enum(ORG_ROLES)
export type OrgRole = z.infer<typeof orgRoleSchema>

/**
 * What the UI calls each role (checklist 5.3: never the internal names). Here
 * rather than in a component because the invitation email says it too.
 */
export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  member: 'Anggota',
  viewer: 'Pengamat',
}

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Akses penuh, termasuk menghapus organisasi dan menyerahkan kepemilikan.',
  admin: 'Semua hal kecuali mengelola organisasi — termasuk mengundang anggota.',
  member: 'Mengunggah data, menjalankan analisis, dan mengekspor laporan.',
  viewer: 'Hanya membaca dan mengekspor laporan.',
}

/** What an invitation can make someone. Ownership only ever moves by transfer. */
export const INVITABLE_ROLES = ['admin', 'member', 'viewer'] as const
export const invitableRoleSchema = z.enum(INVITABLE_ROLES)
export type InvitableRole = z.infer<typeof invitableRoleSchema>

/**
 * The three zones an Indonesian school can sit in. Every date the app prints
 * goes through one of these; before this setting existed, server-rendered
 * dates came out in the server's zone, which on Vercel is UTC.
 */
export const ORG_TIME_ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const
export const orgTimeZoneSchema = z.enum(ORG_TIME_ZONES)
export type OrgTimeZone = z.infer<typeof orgTimeZoneSchema>
export const DEFAULT_TIME_ZONE: OrgTimeZone = 'Asia/Jakarta'

export const TIME_ZONE_ABBREVIATIONS: Record<OrgTimeZone, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

export function isOrgTimeZone(value: unknown): value is OrgTimeZone {
  return (ORG_TIME_ZONES as readonly unknown[]).includes(value)
}

/**
 * What a PDF export includes. Set once per organization so an export never
 * asks: the person pressing "Unduh PDF" the night before a meeting should not
 * be making layout decisions.
 */
export type ReportPreferences = {
  includeQuotes: boolean
  includeTopicTail: boolean
  includeProvenance: boolean
}

/** Matches the column defaults, and what the PDF printed before the setting. */
export const DEFAULT_REPORT_PREFERENCES: ReportPreferences = {
  includeQuotes: true,
  includeTopicTail: false,
  includeProvenance: true,
}

export type Organization = {
  id: string
  name: string
  slug: string
  createdAt: string
}

export type OrganizationMember = {
  userId: string
  organizationId: string
  role: OrgRole
  email: string
  fullName: string | null
}

export type Dataset = {
  id: string
  organizationId: string
  name: string
  source: DatasetSource
  storagePath: string | null
  responseCount: number
  uploaderId: string
  /** Header the responses were taken from; null for datasets created before mapping. */
  textColumnName: string | null
  /**
   * Extra columns the uploader ticked to keep beside the text. Empty is the
   * default and the common case — §P4 requires the UI to state which columns a
   * dataset holds, and "none" is the answer that most needs stating.
   */
  keptColumns: string[]
  /** When this dataset's retention period began (see lib/retention.ts). */
  retentionClockAt: string
  /** Set once the retention sweep has hidden it; null for a live dataset. */
  archivedAt: string | null
  createdAt: string
}

export type ResponseRecord = {
  id: string
  datasetId: string
  organizationId: string
  text: string
  respondentMeta: Record<string, string | number | boolean | null>
  createdAt: string
}

export type AnalysisJob = {
  id: string
  organizationId: string
  datasetId: string
  status: JobStatus
  promptVersion: string
  modelId: string
  processedCount: number
  totalCount: number
  failedCount: number
  inputTokens: number
  outputTokens: number
  /** Estimated spend in millionths of IDR; integer to avoid float drift. */
  costMicroIdr: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  /** Who pressed "Mulai analisis"; null for jobs from before it was recorded. */
  createdBy: string | null
  /** Set when the job's dataset was archived by retention; null otherwise. */
  archivedAt: string | null
  createdAt: string
}

export type AnalysisResult = {
  id: string
  organizationId: string
  jobId: string
  responseId: string
  sentiment: Sentiment
  sentimentConfidence: number
  topics: string[]
  keywords: string[]
  summary: string | null
  promptVersion: string
  modelId: string
  createdAt: string
}

export type TopicBreakdown = {
  topic: string
  count: number
  share: number
  sentimentCounts: Record<Sentiment, number>
}

export type ReportInsight = {
  title: string
  detail: string
  /** Response ids backing this insight — keeps the report auditable. */
  evidenceResponseIds: string[]
}

export type Report = {
  id: string
  organizationId: string
  jobId: string
  summary: string
  insights: ReportInsight[]
  sentimentCounts: Record<Sentiment, number>
  topics: TopicBreakdown[]
  exportedAt: string | null
  createdAt: string
}
