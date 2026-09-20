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

export const ORG_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export const orgRoleSchema = z.enum(ORG_ROLES)
export type OrgRole = z.infer<typeof orgRoleSchema>

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
