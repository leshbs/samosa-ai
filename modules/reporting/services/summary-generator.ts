import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { readAll } from '@/lib/supabase/read-all'
import {
  DEFAULT_SUMMARY_VERSION,
  applyTopicMerge,
  createOpenAiAdapter,
  questionMode,
  questionNoContent,
  readQuestionCounts,
  readTopicMerges,
  summaryPrompt,
  type LlmAdapter,
  type QuestionDigest,
} from '@/modules/analysis'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { QuestionMode, ReportInsight, Sentiment, TopicMerges } from '@/types/domain'
import { aggregateKeywords } from '../aggregators/keywords'
import { aggregateScale } from '../aggregators/scale'
import { groupByQuestion, type ReportQuestion } from '../aggregators/sections'
import { aggregateSentiment } from '../aggregators/sentiment'
import { aggregateTopics } from '../aggregators/topics'
import { truncateQuote, writeQuestionFindings } from './insight-writer'

/** Enough quotes for the model to ground insights in, few enough to stay cheap. */
const MAX_QUOTES = 18
/** With several questions each still needs a few to cite. */
const MIN_QUOTES_PER_QUESTION = 3
const QUOTES_PER_TOPIC = 2
const TOPICS_TO_SAMPLE = 6

const TOP_TOPICS_IN_PROMPT = 5
const TOP_KEYWORDS_IN_PROMPT = 10
/** A question that asks for a choice is described by its choices: more of them. */
const TOP_CHOICES_IN_PROMPT = 10

/** The question of a job that has no questions on record: one pool, as before. */
const UNNAMED_QUESTION: ReportQuestion = { id: '', text: 'Aspirasi', mode: 'evaluative' }

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

/** What the embedded select returns; the database types declare no relationships. */
type SummaryRow = {
  response_id: string
  sentiment: string | null
  topics: string[] | null
  keywords: string[] | null
  responses: JoinedResponse | JoinedResponse[] | null
}

type JoinedResponse = { text?: string; question_id?: string }

type SampledRow = {
  responseId: string
  questionId: string
  text: string
  sentiment: Sentiment | null
  topics: string[]
  keywords: string[]
}

/**
 * Picks quotes the model can cite. Spread across the loudest topics rather than
 * taken off the top of the table: the first twenty rows of a dataset are an
 * accident of upload order, not a cross-section of what people said.
 */
export function selectQuotes<Row extends Omit<SampledRow, 'questionId'>>(
  rows: readonly Row[],
  limit: number = MAX_QUOTES,
): Row[] {
  const byTopic = aggregateTopics(rows, TOPICS_TO_SAMPLE)
  const picked = new Map<string, Row>()

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
      if (picked.size >= limit) break
      picked.set(row.responseId, row)
    }
  }

  for (const row of rows) {
    if (picked.size >= limit) break
    if (!picked.has(row.responseId)) picked.set(row.responseId, row)
  }

  return [...picked.values()]
}

/** One question as the summary prompt is told about it. */
function digestQuestion(
  question: ReportQuestion,
  rows: readonly SampledRow[],
  noContent: number | null,
): QuestionDigest {
  const base = {
    text: question.text,
    mode: question.mode,
    answers: rows.length,
    noContent,
  }
  const terms = (limit: number) =>
    aggregateTopics(rows, limit).map((topic) => ({
      term: topic.term,
      count: topic.count,
    }))

  if (question.mode === 'scale') {
    const scale = aggregateScale(rows)
    return {
      ...base,
      top: scale.values.map((value) => ({ term: value.term, count: value.count })),
      scale: { mean: scale.mean, mostCommon: scale.mostCommon },
    }
  }
  if (question.mode === 'categorical') {
    return { ...base, top: terms(TOP_CHOICES_IN_PROMPT) }
  }

  return {
    ...base,
    ...(question.mode === 'evaluative'
      ? { sentimentCounts: aggregateSentiment(rows).counts }
      : {}),
    top: terms(TOP_TOPICS_IN_PROMPT),
    topKeywords: aggregateKeywords(rows, TOP_KEYWORDS_IN_PROMPT).map((keyword) => ({
      term: keyword.term,
      count: keyword.count,
    })),
  }
}

type SummaryQuestion = ReportQuestion & { noContent: number | null }

/**
 * The job's questions in sheet order, each with the mode the job read it with
 * and its count of non-answers, and the topic labels the job counts as one.
 * No questions when either read fails: the summary is then written from one
 * pool, which is what it was before questions existed.
 */
async function loadQuestions(
  organizationId: string,
  jobId: string,
): Promise<{ questions: SummaryQuestion[]; merges: TopicMerges }> {
  const supabase = createAdminClient()

  // `*`: naming `topic_merges` would lose the whole row, and with it every
  // question, on a database that has not had that migration.
  const { data } = await supabase
    .from('analysis_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!data) return { questions: [], merges: {} }
  const job = data as Record<string, unknown>
  const merges = readTopicMerges(job.topic_merges)

  const { data: questions } = await supabase
    .from('dataset_questions')
    .select('id, question_text, position')
    .eq('dataset_id', String(job.dataset_id))
    .order('position', { ascending: true })
  if (!questions || questions.length === 0) return { questions: [], merges }

  const counted = {
    promptVersion: String(job.prompt_version),
    noContentCount: Number(job.no_content_count ?? 0),
    questionCounts: readQuestionCounts(job.question_counts),
  }

  return {
    merges,
    questions: questions.map((row) => {
      const id = String(row.id)
      return {
        id,
        text: String(row.question_text),
        mode: questionMode(counted, id) satisfies QuestionMode,
        noContent: questionNoContent(counted, id, questions.length),
      }
    }),
  }
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

  // Paged: a single select stops at 1,000 rows, and a summary written from
  // the first thousand would quote counts the charts below it contradict.
  const { data, error } = await readAll<SummaryRow>(
    (from, to) =>
      supabase
        .from('analysis_results')
        .select('response_id, sentiment, topics, keywords, responses (text, question_id)')
        .eq('job_id', input.jobId)
        .eq('organization_id', input.organizationId)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: SummaryRow[] | null
        error: unknown
      }>,
  )

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Hasil analisis tidak bisa dimuat'))
  }
  if (data.length === 0) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Analisis ini belum punya hasil'))
  }

  const { questions, merges } = await loadQuestions(input.organizationId, input.jobId)

  // Topics as the report counts them, so the summary quotes the same numbers
  // the charts below it draw.
  const rows: SampledRow[] = data.map((row) => {
    const joined = Array.isArray(row.responses) ? row.responses[0] : row.responses
    const questionId = String(joined?.question_id ?? '')
    return {
      responseId: String(row.response_id),
      questionId,
      text: joined?.text ?? '',
      sentiment: (row.sentiment ?? null) as Sentiment | null,
      topics: applyTopicMerge((row.topics ?? []) as string[], merges[questionId]),
      keywords: (row.keywords ?? []) as string[],
    }
  })

  const noContentOf = new Map(
    questions.map((question) => [question.id, question.noContent]),
  )
  const sections = groupByQuestion(rows, questions)
  // A job with no questions on record leaves every row a stray: one pool.
  const digestible =
    sections.length === 1 && sections[0]?.question.id === ''
      ? [{ question: UNNAMED_QUESTION, rows, noContent: null }]
      : sections.map((section) => ({
          ...section,
          noContent: noContentOf.get(section.question.id) ?? null,
        }))

  // Only prose is quoted or has findings: a choice or a number is already its
  // own count.
  const prose = digestible.filter(
    (section) =>
      section.question.mode === 'evaluative' || section.question.mode === 'thematic',
  )
  const adapter = input.adapter ?? createOpenAiAdapter()
  const promptVersion = input.promptVersion ?? DEFAULT_SUMMARY_VERSION
  // From summary.v4 the findings are picked from the data and written apart;
  // the versions before it wrote them in this call, from sampled quotes.
  const apart = summaryPrompt(promptVersion).writesInsightsApart

  const quotes: SampledRow[] = []
  const quoteQuestions: number[] = []
  if (!apart) {
    const perQuestion = Math.max(
      MIN_QUOTES_PER_QUESTION,
      Math.floor(MAX_QUOTES / Math.max(1, prose.length)),
    )
    digestible.forEach((section, index) => {
      if (!prose.includes(section)) return
      for (const quote of selectQuotes(section.rows, perQuestion)) {
        quotes.push(quote)
        quoteQuestions.push(index + 1)
      }
    })
  }

  const proseRows = prose.flatMap((section) => section.rows)

  const request = {
    promptVersion,
    data: {
      // The pooled figures are what summary.v1 and v2 read; v3 reads `questions`.
      totalResponses: rows.length,
      sentimentCounts: aggregateSentiment(rows).counts,
      topTopics: aggregateTopics(proseRows, TOP_TOPICS_IN_PROMPT).map((topic) => ({
        topic: topic.term,
        count: topic.count,
      })),
      topKeywords: aggregateKeywords(proseRows, TOP_KEYWORDS_IN_PROMPT).map(
        (keyword) => ({
          term: keyword.term,
          count: keyword.count,
        }),
      ),
      sampleQuotes: quotes.map((quote) => truncateQuote(quote.text)),
      questions: digestible.map((section) =>
        digestQuestion(section.question, section.rows, section.noContent),
      ),
      quoteQuestions,
    },
  }

  /**
   * One more ask when the model's reply broke the output format. Measured on a
   * two-question dataset: about one reply in a hundred fails the schema, and a
   * job that hits it finishes with an empty summary. The same request again is
   * a fresh draw — the failures were not repeatable. Only this kind of failure
   * is retried: an unreachable provider has already been retried inside the
   * adapter, and asking again would only hold the job open longer.
   */
  const summarize = async () => {
    const first = await adapter.summarize(request)
    if (first.ok || first.error.details?.malformedReply !== true) return first
    log.warn('reporting.summary.retrying', {
      reason: first.error.message,
      ...first.error.details,
    })
    return adapter.summarize(request)
  }

  // The paragraph and each question's findings are separate calls; none waits
  // on another.
  const [result, findings] = await Promise.all([
    summarize(),
    apart
      ? Promise.all(
          prose.map((section) =>
            writeQuestionFindings(adapter, {
              questionId: section.question.id || null,
              text: section.question.text,
              mode: section.question.mode === 'thematic' ? 'thematic' : 'evaluative',
              rows: section.rows,
            }),
          ),
        )
      : Promise.resolve([]),
  ])

  if (!result.ok) return result

  findings.forEach((question, index) => {
    log.info('reporting.insights.written', {
      question: prose[index]?.question.id || null,
      ...question.stats,
    })
  })

  // The model cites quote numbers; only positions that exist become evidence.
  // A hallucinated "[9]" against three quotes silently drops rather than
  // pointing a reader at a response that was never shown to the model.
  const { citesQuestions } = result.value
  const insights: ReportInsight[] = apart
    ? // Most supported first across questions: the screen shows the first five.
      findings
        .flatMap((question) => question.insights)
        .sort((a, b) => (b.support ?? 0) - (a.support ?? 0))
    : result.value.insights.map((insight) => ({
        title: insight.title,
        detail: insight.detail,
        evidenceResponseIds: insight.evidence
          .map((position) => quotes[position - 1]?.responseId)
          .filter((id): id is string => Boolean(id)),
        // A number past the last question is read as "several", like 0: an
        // origin the reader cannot open is worse than none.
        ...(citesQuestions
          ? {
              questionId:
                (insight.question
                  ? digestible[insight.question - 1]?.question.id
                  : undefined) || null,
            }
          : {}),
      }))
  const costMicroIdr =
    result.value.costMicroIdr +
    findings.reduce((sum, question) => sum + question.costMicroIdr, 0)

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
    return err(appError(ERROR_CODES.INTERNAL, 'Ringkasan laporan tidak bisa disimpan'))
  }

  log.info('reporting.summary.generated', {
    promptVersion,
    modelId: result.value.modelId,
    quotes: quotes.length,
    insights: insights.length,
    costMicroIdr,
  })

  return ok({
    summary: result.value.summary,
    insights,
    costMicroIdr,
  })
}
