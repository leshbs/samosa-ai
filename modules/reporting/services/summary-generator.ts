import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_SUMMARY_VERSION,
  createOpenAiAdapter,
  type LlmAdapter,
} from '@/modules/analysis'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { ReportInsight, Sentiment } from '@/types/domain'
import { aggregateKeywords } from '../aggregators/keywords'
import { aggregateSentiment } from '../aggregators/sentiment'
import { aggregateTopics } from '../aggregators/topics'

/** Enough quotes for the model to ground insights in, few enough to stay cheap. */
const MAX_QUOTES = 18
const QUOTES_PER_TOPIC = 2
const TOPICS_TO_SAMPLE = 6
/** A single rambling aspiration should not crowd out seventeen others. */
const MAX_QUOTE_LENGTH = 240

const TOP_TOPICS_IN_PROMPT = 5
const TOP_KEYWORDS_IN_PROMPT = 10

export type GenerateSummaryInput = {
  organizationId: string
  jobId: string
  promptVersion?: string
  /** Injectable so tests never reach the network. */
  adapter?: LlmAdapter
}

export type GeneratedSummary = {
  summary: string
  insights: ReportInsight[]
  costMicroIdr: number
}

type SampledRow = {
  responseId: string
  text: string
  sentiment: Sentiment
  topics: string[]
  keywords: string[]
}

/**
 * Picks quotes the model can cite. Spread across the loudest topics rather than
 * taken off the top of the table: the first twenty rows of a dataset are an
 * accident of upload order, not a cross-section of what people said.
 */
export function selectQuotes(rows: readonly SampledRow[]): SampledRow[] {
  const byTopic = aggregateTopics(rows, TOPICS_TO_SAMPLE)
  const picked = new Map<string, SampledRow>()

  for (const { term } of byTopic) {
    const matching = rows.filter((row) =>
      row.topics.some((topic) => topic.toLowerCase().trim() === term),
    )
    // Negative first: complaints carry the actionable detail, and a report that
    // only quotes praise is the one nobody trusts.
    const ordered = [
      ...matching.filter((row) => row.sentiment === 'negative'),
      ...matching.filter((row) => row.sentiment !== 'negative'),
    ]
    for (const row of ordered.slice(0, QUOTES_PER_TOPIC)) {
      if (picked.size >= MAX_QUOTES) break
      picked.set(row.responseId, row)
    }
  }

  for (const row of rows) {
    if (picked.size >= MAX_QUOTES) break
    if (!picked.has(row.responseId)) picked.set(row.responseId, row)
  }

  return [...picked.values()]
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= MAX_QUOTE_LENGTH ? clean : `${clean.slice(0, MAX_QUOTE_LENGTH)}…`
}

export type StoredSummary = {
  summary: string
  insights: ReportInsight[]
  createdAt: string
}

/**
 * Reads the cached narrative. Returns null when a job finished before summaries
 * existed, or when generation failed — the page renders its charts regardless
 * and offers to generate one.
 */
export async function getStoredSummary(
  organizationId: string,
  jobId: string,
): Promise<StoredSummary | null> {
  const { data } = await createAdminClient()
    .from('reports')
    .select('summary, insights, created_at')
    .eq('job_id', jobId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!data || !String(data.summary).trim()) return null

  return {
    summary: String(data.summary),
    insights: (data.insights ?? []) as ReportInsight[],
    createdAt: String(data.created_at),
  }
}

/**
 * Writes the executive summary onto the report row. Called once when a job
 * finishes and again only if someone presses Regenerate — never on page load,
 * because every call costs money and the narrative does not change on its own.
 */
export async function generateReportSummary(
  input: GenerateSummaryInput,
): Promise<Result<GeneratedSummary, AppError>> {
  const supabase = createAdminClient()
  const log = logger.child({ jobId: input.jobId })

  const { data, error } = await supabase
    .from('analysis_results')
    .select('response_id, sentiment, topics, keywords, responses (text)')
    .eq('job_id', input.jobId)
    .eq('organization_id', input.organizationId)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not load analysis results'))
  }
  if (!data || data.length === 0) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'No analysis results for this job'))
  }

  const rows: SampledRow[] = data.map((row) => {
    const joined = row.responses as { text?: string } | { text?: string }[] | null
    const text = Array.isArray(joined) ? (joined[0]?.text ?? '') : (joined?.text ?? '')
    return {
      responseId: String(row.response_id),
      text,
      sentiment: row.sentiment as Sentiment,
      topics: (row.topics ?? []) as string[],
      keywords: (row.keywords ?? []) as string[],
    }
  })

  const quotes = selectQuotes(rows)
  const adapter = input.adapter ?? createOpenAiAdapter()
  const promptVersion = input.promptVersion ?? DEFAULT_SUMMARY_VERSION

  const result = await adapter.summarize({
    promptVersion,
    data: {
      totalResponses: rows.length,
      sentimentCounts: aggregateSentiment(rows).counts,
      topTopics: aggregateTopics(rows, TOP_TOPICS_IN_PROMPT).map((topic) => ({
        topic: topic.term,
        count: topic.count,
      })),
      topKeywords: aggregateKeywords(rows, TOP_KEYWORDS_IN_PROMPT).map((keyword) => ({
        term: keyword.term,
        count: keyword.count,
      })),
      sampleQuotes: quotes.map((quote) => truncate(quote.text)),
    },
  })

  if (!result.ok) return result

  // The model cites quote numbers; only positions that exist become evidence.
  // A hallucinated "[9]" against three quotes silently drops rather than
  // pointing a reader at a response that was never shown to the model.
  const insights: ReportInsight[] = result.value.insights.map((insight) => ({
    title: insight.title,
    detail: insight.detail,
    evidenceResponseIds: insight.evidence
      .map((position) => quotes[position - 1]?.responseId)
      .filter((id): id is string => Boolean(id)),
  }))

  const { error: upsertError } = await supabase.from('reports').upsert(
    {
      organization_id: input.organizationId,
      job_id: input.jobId,
      summary: result.value.summary,
      insights,
    },
    { onConflict: 'job_id' },
  )

  if (upsertError) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not save the report summary'))
  }

  log.info('reporting.summary.generated', {
    promptVersion,
    modelId: result.value.modelId,
    quotes: quotes.length,
    insights: insights.length,
    costMicroIdr: result.value.costMicroIdr,
  })

  return ok({
    summary: result.value.summary,
    insights,
    costMicroIdr: result.value.costMicroIdr,
  })
}
