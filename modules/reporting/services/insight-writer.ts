import 'server-only'

import {
  DEFAULT_INSIGHT_VERSION,
  askTwice,
  themeQuestionTopics,
  type InsightCandidateInput,
  type InsightInput,
  type LlmAdapter,
  type WrittenInsight,
} from '@/modules/analysis'
import type { ReportInsight } from '@/types/domain'
import {
  MIN_EVIDENCE,
  pickCandidates,
  type CandidateRow,
  type InsightCandidate,
} from '../aggregators/insight-candidates'

/** A single rambling answer should not crowd out the rest of the request. */
export const MAX_QUOTE_LENGTH = 240

export function truncateQuote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= MAX_QUOTE_LENGTH ? clean : `${clean.slice(0, MAX_QUOTE_LENGTH)}…`
}

/** One prose question, as its findings are written. */
export type FindingsQuestion = {
  /** Null for the one pool of a job with no questions on record. */
  questionId: string | null
  text: string
  mode: 'evaluative' | 'thematic'
  rows: readonly CandidateRow[]
}

export type QuestionFindings = {
  insights: ReportInsight[]
  costMicroIdr: number
  /** For the log: where the findings that were not kept went. */
  stats: {
    themes: number | null
    candidates: number
    written: number
    /** Written, but citing fewer than two of the item's own answers. */
    ungrounded: number
    /** Never written: the reply skipped them. */
    unwritten: number
    /** Why there are none, when a call failed. */
    failed?: 'themes' | 'insights'
  }
}

/** An item with its quotes numbered across the whole request, from 1. */
type NumberedCandidate = InsightCandidate & {
  quotes: Array<{ number: number; responseId: string }>
}

export function numberQuotes(
  candidates: readonly InsightCandidate[],
): NumberedCandidate[] {
  let next = 1
  return candidates.map((candidate) => ({
    ...candidate,
    quotes: candidate.quoteIds.map((responseId) => ({ number: next++, responseId })),
  }))
}

/**
 * Keeps the findings that stand on their own item's answers.
 *
 * The first finding written for an item is the one kept; a number no item
 * has is ignored. A citation counts only if it is one of the item's own
 * quotes — the model was shown all of them in one request and could reach
 * for a neighbour's. Fewer than two such citations and the finding is dropped
 * (pilot-01-findings.md §5: an observation, not a finding).
 */
export function keepGrounded(
  candidates: readonly NumberedCandidate[],
  written: readonly WrittenInsight[],
  questionId: string | null,
): { insights: ReportInsight[]; ungrounded: number; unwritten: number } {
  const byNumber = new Map<number, WrittenInsight>()
  for (const insight of written) {
    if (!byNumber.has(insight.candidate)) byNumber.set(insight.candidate, insight)
  }

  const insights: ReportInsight[] = []
  let ungrounded = 0
  let unwritten = 0

  candidates.forEach((candidate, index) => {
    const insight = byNumber.get(index + 1)
    if (!insight) {
      unwritten += 1
      return
    }
    const own = new Map(candidate.quotes.map((quote) => [quote.number, quote.responseId]))
    const evidence = [
      ...new Set(
        insight.evidence
          .map((number) => own.get(number))
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    if (evidence.length < MIN_EVIDENCE) {
      ungrounded += 1
      return
    }

    insights.push({
      title: insight.title,
      detail: insight.detail,
      evidenceResponseIds: evidence,
      questionId,
      support: candidate.support,
      topics: candidate.topics.map((topic) => topic.term),
      signal: candidate.signal,
    })
  })

  return { insights, ungrounded, unwritten }
}

/**
 * The findings of one prose question: themes for a critique, then the items
 * enough answers mention, then one call that writes them.
 *
 * Never fails the report. A critique whose themes cannot be drawn is written
 * per topic, which is what it was before themes; a question whose findings
 * cannot be written has none, and the summary still stands.
 */
export async function writeQuestionFindings(
  adapter: LlmAdapter,
  question: FindingsQuestion,
  options: { insightVersion?: string; themeVersion?: string } = {},
): Promise<QuestionFindings> {
  const evaluative = question.mode === 'evaluative'
  let costMicroIdr = 0
  let groups: Array<{ name: string; topics: string[] }> | undefined
  let failed: QuestionFindings['stats']['failed']

  if (evaluative) {
    const themes = await themeQuestionTopics(adapter, {
      question: question.text,
      answers: question.rows.map((row) => row.topics),
      promptVersion: options.themeVersion,
    })
    if (themes.ok) {
      groups = themes.value.themes
      costMicroIdr += themes.value.costMicroIdr
    } else {
      failed = 'themes'
    }
  }

  const candidates = numberQuotes(
    pickCandidates({ rows: question.rows, evaluative, groups }),
  )
  const stats: QuestionFindings['stats'] = {
    themes: groups ? groups.filter((group) => group.topics.length > 1).length : null,
    candidates: candidates.length,
    written: 0,
    ungrounded: 0,
    unwritten: 0,
    ...(failed ? { failed } : {}),
  }
  if (candidates.length === 0) return { insights: [], costMicroIdr, stats }

  const textOf = new Map(question.rows.map((row) => [row.responseId, row.text]))
  const items: InsightCandidateInput[] = candidates.map((candidate, index) => ({
    number: index + 1,
    name: candidate.name,
    topics: candidate.topics,
    support: candidate.support,
    ...(candidate.sentimentCounts ? { sentimentCounts: candidate.sentimentCounts } : {}),
    signal: candidate.signal,
    quotes: candidate.quotes.map((quote) => ({
      number: quote.number,
      text: truncateQuote(textOf.get(quote.responseId) ?? ''),
    })),
  }))

  const base = {
    question: question.text,
    mode: question.mode,
    answers: question.rows.length,
    promptVersion: options.insightVersion ?? DEFAULT_INSIGHT_VERSION,
  }
  const replies = await Promise.all(
    chunk(items, CANDIDATES_PER_CALL).map((part) => writeChunk(adapter, base, part)),
  )
  const written = replies.flatMap((reply) => reply.written)
  costMicroIdr += replies.reduce((sum, reply) => sum + reply.costMicroIdr, 0)
  if (replies.some((reply) => reply.failed)) stats.failed = 'insights'

  const kept = keepGrounded(candidates, written, question.questionId)
  return {
    insights: kept.insights,
    costMicroIdr,
    stats: {
      ...stats,
      written: kept.insights.length,
      ungrounded: kept.ungrounded,
      unwritten: kept.unwritten,
    },
  }
}

/**
 * Items written in one call. Past this the reply runs long and slow, and on
 * the pilot the model began to skip items; a longer list is split into calls
 * of near-equal size that run side by side.
 */
export const CANDIDATES_PER_CALL = 15

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts = Math.ceil(items.length / size)
  const per = Math.ceil(items.length / Math.max(1, parts))
  const out: T[][] = []
  for (let start = 0; start < items.length; start += per) {
    out.push(items.slice(start, start + per))
  }
  return out
}

/**
 * One call for a part of the list, and one more for the items its reply
 * skipped. A finding left unwritten because the model stopped early would make
 * the count depend on the model after all.
 */
async function writeChunk(
  adapter: LlmAdapter,
  base: Omit<InsightInput, 'candidates'>,
  items: readonly InsightCandidateInput[],
): Promise<{ written: WrittenInsight[]; costMicroIdr: number; failed: boolean }> {
  const first = await askTwice(() =>
    adapter.writeInsights({ ...base, candidates: [...items] }),
  )
  if (!first.ok) return { written: [], costMicroIdr: 0, failed: true }

  const got = new Set(first.value.insights.map((insight) => insight.candidate))
  const missing = items.filter((item) => !got.has(item.number))
  if (missing.length === 0) {
    return {
      written: first.value.insights,
      costMicroIdr: first.value.costMicroIdr,
      failed: false,
    }
  }

  const second = await askTwice(() =>
    adapter.writeInsights({ ...base, candidates: missing }),
  )
  return {
    written: second.ok
      ? [...first.value.insights, ...second.value.insights]
      : first.value.insights,
    costMicroIdr: first.value.costMicroIdr + (second.ok ? second.value.costMicroIdr : 0),
    failed: false,
  }
}
