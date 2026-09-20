/**
 * Hand-written to mirror supabase/migrations/. Regenerate against a live project
 * with `pnpm db:types` — this file is checked in (see CLAUDE.md) so a fresh
 * clone typechecks before anyone has a database.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Sentiment = 'positive' | 'neutral' | 'negative'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type DatasetSource = 'csv' | 'xlsx' | 'google_forms' | 'manual'
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

type OrganizationsRow = {
  id: string
  name: string
  slug: string
  created_at: string
}

type OrganizationMembersRow = {
  user_id: string
  organization_id: string
  role: OrgRole
  created_at: string
}

type DatasetsRow = {
  id: string
  organization_id: string
  uploader_id: string
  name: string
  source: DatasetSource
  storage_path: string | null
  response_count: number
  metadata: Json
  created_at: string
}

type ResponsesRow = {
  id: string
  dataset_id: string
  organization_id: string
  text: string
  respondent_meta: Json
  created_at: string
}

type AnalysisJobsRow = {
  id: string
  organization_id: string
  dataset_id: string
  status: JobStatus
  prompt_version: string
  model_id: string | null
  processed_count: number
  total_count: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

type AnalysisResultsRow = {
  id: string
  organization_id: string
  job_id: string
  response_id: string
  sentiment: Sentiment
  sentiment_confidence: number
  topics: string[]
  keywords: string[]
  summary: string | null
  prompt_version: string
  model_id: string
  created_at: string
}

type ReportsRow = {
  id: string
  organization_id: string
  job_id: string
  summary: string
  insights: Json
  exported_at: string | null
  created_at: string
}

/** Columns with a database default are optional on insert. */
type Table<Row, Generated extends keyof Row> = {
  Row: Row
  Insert: Omit<Row, Generated> & Partial<Pick<Row, Generated>>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      organizations: Table<OrganizationsRow, 'id' | 'created_at'>
      organization_members: Table<OrganizationMembersRow, 'role' | 'created_at'>
      datasets: Table<
        DatasetsRow,
        'id' | 'storage_path' | 'response_count' | 'metadata' | 'created_at'
      >
      responses: Table<ResponsesRow, 'id' | 'respondent_meta' | 'created_at'>
      analysis_jobs: Table<
        AnalysisJobsRow,
        | 'id'
        | 'status'
        | 'model_id'
        | 'processed_count'
        | 'total_count'
        | 'error_message'
        | 'started_at'
        | 'finished_at'
        | 'created_at'
      >
      analysis_results: Table<
        AnalysisResultsRow,
        'id' | 'topics' | 'keywords' | 'summary' | 'created_at'
      >
      reports: Table<ReportsRow, 'id' | 'summary' | 'insights' | 'exported_at' | 'created_at'>
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      sentiment: Sentiment
      job_status: JobStatus
      dataset_source: DatasetSource
      org_role: OrgRole
    }
    CompositeTypes: Record<never, never>
  }
}
