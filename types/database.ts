/**
 * Hand-written to mirror supabase/migrations/. Regenerate against a live project
 * with `pnpm db:types` — this file is checked in (see CLAUDE.md) so a fresh
 * clone typechecks before anyone has a database.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Sentiment = 'positive' | 'neutral' | 'negative'
export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled'
export type DatasetSource = 'csv' | 'xlsx' | 'google_forms' | 'manual'
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export type AccountPlan = 'free' | 'org' | 'enterprise'

export type OrgTimeZone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura'

type AccountsRow = {
  id: string
  owner_id: string | null
  plan: AccountPlan
  limits: Json
  billing_email: string | null
  created_at: string
  updated_at: string
}

type OrganizationsRow = {
  id: string
  name: string
  slug: string
  account_id: string
  logo_path: string | null
  timezone: OrgTimeZone
  report_include_quotes: boolean
  report_include_topic_tail: boolean
  report_include_provenance: boolean
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
  retention_clock_at: string
  archived_at: string | null
  retention_stage: number
  retention_notified_at: string | null
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
  failed_count: number
  no_content_count: number
  input_tokens: number
  output_tokens: number
  cost_micro_idr: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_by: string | null
  archived_at: string | null
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

type ProfilesRow = {
  user_id: string
  display_name: string
  title: string
  avatar_path: string | null
  notify_analysis_finished: boolean
  updated_at: string
}

type OrganizationInvitationsRow = {
  id: string
  organization_id: string
  email: string
  role: OrgRole
  token_hash: string
  invited_by: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
}

type RateLimitsRow = {
  bucket: string
  window_start: string
  request_count: number
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
      accounts: Table<
        AccountsRow,
        'id' | 'plan' | 'limits' | 'billing_email' | 'created_at' | 'updated_at'
      >
      organizations: Table<
        OrganizationsRow,
        | 'id'
        | 'logo_path'
        | 'timezone'
        | 'report_include_quotes'
        | 'report_include_topic_tail'
        | 'report_include_provenance'
        | 'created_at'
      >
      organization_members: Table<OrganizationMembersRow, 'role' | 'created_at'>
      datasets: Table<
        DatasetsRow,
        | 'id'
        | 'storage_path'
        | 'response_count'
        | 'metadata'
        | 'retention_clock_at'
        | 'archived_at'
        | 'retention_stage'
        | 'retention_notified_at'
        | 'created_at'
      >
      responses: Table<ResponsesRow, 'id' | 'respondent_meta' | 'created_at'>
      analysis_jobs: Table<
        AnalysisJobsRow,
        | 'id'
        | 'archived_at'
        | 'status'
        | 'model_id'
        | 'processed_count'
        | 'total_count'
        | 'failed_count'
        | 'no_content_count'
        | 'input_tokens'
        | 'output_tokens'
        | 'cost_micro_idr'
        | 'error_message'
        | 'started_at'
        | 'finished_at'
        | 'created_by'
        | 'created_at'
      >
      analysis_results: Table<
        AnalysisResultsRow,
        'id' | 'topics' | 'keywords' | 'summary' | 'created_at'
      >
      reports: Table<ReportsRow, 'id' | 'summary' | 'insights' | 'exported_at' | 'created_at'>
      rate_limits: Table<RateLimitsRow, 'window_start' | 'request_count'>
      profiles: Table<
        ProfilesRow,
        'display_name' | 'title' | 'avatar_path' | 'notify_analysis_finished' | 'updated_at'
      >
      organization_invitations: Table<
        OrganizationInvitationsRow,
        | 'id'
        | 'invited_by'
        | 'created_at'
        | 'expires_at'
        | 'accepted_at'
        | 'accepted_by'
        | 'revoked_at'
      >
    }
    Views: Record<never, never>
    Functions: {
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: Array<{ allowed: boolean; remaining: number; reset_at: string }>
      }
      accept_organization_invitation: {
        Args: { p_token_hash: string; p_leave_organization_id?: string }
        Returns: Array<{
          joined_organization_id: string
          left_organization_id: string | null
        }>
      }
      transfer_organization_ownership: {
        Args: { p_organization_id: string; p_new_owner: string }
        Returns: undefined
      }
      current_user_has_password: {
        Args: Record<string, never>
        Returns: boolean
      }
      shares_organization_with: {
        Args: { target: string }
        Returns: boolean
      }
    }
    Enums: {
      sentiment: Sentiment
      job_status: JobStatus
      dataset_source: DatasetSource
      org_role: OrgRole
      account_plan: AccountPlan
    }
    CompositeTypes: Record<never, never>
  }
}
