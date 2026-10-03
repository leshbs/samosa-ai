import {
  isQuestionMode,
  type AnalysisJob,
  type QuestionCounts,
  type QuestionMode,
} from '@/types/domain'
import { separatesNoContent } from '../prompts'

/**
 * `analysis_jobs.question_counts` on disk:
 *   { "<question id>": { "analyzed": 127, "no_content": 54, "failed": 0, "mode": "evaluative" } }
 *
 * `mode` is absent on a job from before modes.
 */
type StoredCounts = {
  analyzed: number
  no_content: number
  failed: number
  mode?: QuestionMode
}

export function toStoredQuestionCounts(
  counts: Readonly<Record<string, QuestionCounts>>,
): Record<string, StoredCounts> {
  return Object.fromEntries(
    Object.entries(counts).map(([questionId, value]) => [
      questionId,
      {
        analyzed: value.analyzed,
        no_content: value.noContent,
        failed: value.failed,
        ...(value.mode ? { mode: value.mode } : {}),
      },
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
      mode: isQuestionMode(stored.mode) ? stored.mode : null,
    }
  }
  return counts
}

/**
 * How a job read one question. A job from before modes recorded none, and read
 * every question as `evaluative`.
 */
export function questionMode(
  job: Pick<AnalysisJob, 'questionCounts'>,
  questionId: string,
): QuestionMode {
  return job.questionCounts[questionId]?.mode ?? 'evaluative'
}

/**
 * How many of a job's results carry a sentiment: the denominator of every
 * sentiment share drawn outside the report, where the rows are not at hand.
 * A job from before modes gave every result one.
 */
export function evaluatedCount(
  job: Pick<AnalysisJob, 'questionCounts' | 'processedCount'>,
): number {
  const counts = Object.values(job.questionCounts)
  if (counts.every((entry) => entry.mode === null)) return job.processedCount

  return counts
    .filter((entry) => entry.mode === 'evaluative')
    .reduce((sum, entry) => sum + entry.analyzed, 0)
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
