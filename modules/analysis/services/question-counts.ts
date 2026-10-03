import type { AnalysisJob, QuestionCounts } from '@/types/domain'
import { separatesNoContent } from '../prompts'

/**
 * `analysis_jobs.question_counts` on disk:
 *   { "<question id>": { "analyzed": 127, "no_content": 54, "failed": 0 } }
 */
type StoredCounts = { analyzed: number; no_content: number; failed: number }

export function toStoredQuestionCounts(
  counts: Readonly<Record<string, QuestionCounts>>,
): Record<string, StoredCounts> {
  return Object.fromEntries(
    Object.entries(counts).map(([questionId, value]) => [
      questionId,
      { analyzed: value.analyzed, no_content: value.noContent, failed: value.failed },
    ]),
  )
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

/**
 * Reads the column defensively: it is free-form jsonb, absent on a database
 * that has not had the migration, and `{}` on every job from before it.
 */
export function readQuestionCounts(value: unknown): Record<string, QuestionCounts> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const counts: Record<string, QuestionCounts> = {}
  for (const [questionId, raw] of Object.entries(value)) {
    if (typeof raw !== 'object' || raw === null) continue
    const stored = raw as Record<string, unknown>
    counts[questionId] = {
      analyzed: count(stored.analyzed),
      noContent: count(stored.no_content),
      failed: count(stored.failed),
    }
  }
  return counts
}

/**
 * How many answers to one question held no aspiration, or null when that was
 * never measured — which is not the same as none.
 *
 * Two kinds of job never measured it per question: one run on a prompt that
 * cannot tell a non-answer apart (analysis.v1), and one from before the counts
 * were split. The second has a single question, so the job's own count is that
 * question's count.
 */
export function questionNoContent(
  job: Pick<AnalysisJob, 'promptVersion' | 'noContentCount' | 'questionCounts'>,
  questionId: string,
  questionCount: number,
): number | null {
  if (!separatesNoContent(job.promptVersion)) return null

  const counts = job.questionCounts[questionId]
  if (counts) return counts.noContent

  return questionCount === 1 ? job.noContentCount : null
}
