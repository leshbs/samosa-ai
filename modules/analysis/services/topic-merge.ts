import { ok, type AppError, type Result } from '@/modules/shared'
import type { QuestionMode, TopicMerge, TopicMerges } from '@/types/domain'
import type { AdapterUsage, LlmAdapter } from '../adapters/types'
import { normalizeTopic } from '../postprocess/normalize'
import { DEFAULT_MERGE_VERSION } from '../prompts'

/**
 * Topic labels that name one thing are counted as one topic (C.5, ADR-0018).
 *
 * The merge is a layer over the results, never a rewrite of them: each answer
 * keeps the labels the model gave it, and the job records which labels are
 * read as which. Reading without the layer gives back exactly what was stored.
 */

/**
 * Labels sent in one call, most mentioned first. The pilot's two questions had
 * 69 and 105; a list several times that still fits one reply, but past a few
 * hundred the model is asked to hold too much at once. What is cut is the tail
 * of labels named once, which stay as they are.
 */
export const MAX_MERGE_TOPICS = 300

/**
 * The most labels one topic may absorb. A group larger than this is not a
 * tidy-up of spellings, it is the model folding a subject area into one bar,
 * and it is dropped whole rather than trimmed to an arbitrary subset.
 */
export const MAX_GROUP_SIZE = 8

/** Only prose has topics to merge: a choice or a number is its own label. */
export function isMergeable(mode: QuestionMode): boolean {
  return mode === 'evaluative' || mode === 'thematic'
}

/**
 * A question's distinct labels, most mentioned first, ties in alphabetical
 * order. One mention per answer, as the report counts them.
 */
export function rankTopics(answers: ReadonlyArray<readonly string[]>): string[] {
  const counts = new Map<string, number>()
  for (const topics of answers) {
    for (const topic of new Set(topics.map(normalizeTopic))) {
      if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic]) => topic)
}

/**
 * Turns the model's groups into "this label is read as that one".
 *
 * The model is trusted for one thing only — which labels belong together — and
 * its reply is checked against the list it was sent. A label that is not on
 * the list is ignored; a label already placed stays in its first group; a
 * group left with one label, or grown past `MAX_GROUP_SIZE`, is dropped. The
 * group goes by its most mentioned label: the one ranked first.
 */
export function resolveGroups(
  ranked: readonly string[],
  groups: ReadonlyArray<readonly string[]>,
): TopicMerge {
  const rankOf = new Map(ranked.map((label, rank) => [label, rank]))
  const merge: TopicMerge = {}
  const placed = new Set<number>()

  for (const group of groups) {
    const members = [
      ...new Set(
        group
          .map((label) => rankOf.get(normalizeTopic(label)))
          .filter((rank): rank is number => rank !== undefined && !placed.has(rank)),
      ),
    ].sort((a, b) => a - b)
    if (members.length < 2 || members.length > MAX_GROUP_SIZE) continue

    const [lead, ...rest] = members
    const name = ranked[lead as number] as string
    for (const rank of members) placed.add(rank)
    for (const rank of rest) merge[ranked[rank] as string] = name
  }

  return merge
}

/**
 * Keeps the proposed merges the second stage confirmed. A pair with no
 * verdict, or one the model reworded past recognition, is not merged: being
 * asked and not answering is not a yes.
 */
export function keepConfirmed(
  proposed: TopicMerge,
  verdicts: ReadonlyArray<{ a: string; b: string; same: boolean }>,
): TopicMerge {
  const key = (a: string, b: string) =>
    [normalizeTopic(a), normalizeTopic(b)].sort().join('\n')
  const confirmed = new Set<string>()
  const refused = new Set<string>()
  for (const verdict of verdicts) {
    ;(verdict.same ? confirmed : refused).add(key(verdict.a, verdict.b))
  }

  const merge: TopicMerge = {}
  for (const [label, name] of Object.entries(proposed)) {
    const pair = key(name, label)
    // A pair judged both ways in one reply was not judged.
    if (confirmed.has(pair) && !refused.has(pair)) merge[label] = name
  }
  return merge
}

export type QuestionMergeOutput = {
  merge: TopicMerge
  /** Merges stage one proposed, before stage two refused some. */
  proposed: number
  usage: AdapterUsage
  costMicroIdr: number
}

const NO_USAGE: AdapterUsage = { inputTokens: 0, outputTokens: 0 }

/** The same request once more when the reply, not the provider, was at fault. */
async function askTwice<T>(
  ask: () => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  const reply = await ask()
  return !reply.ok && reply.error.details?.malformedReply === true ? ask() : reply
}

/**
 * One question's merge, in two calls: propose, then confirm pair by pair
 * (see merge.v1.ts for why one was not enough). If the second call fails,
 * nothing is merged — an unchecked proposal is worse than none.
 */
export async function mergeQuestionTopics(
  adapter: LlmAdapter,
  input: {
    question: string
    answers: ReadonlyArray<readonly string[]>
    promptVersion?: string
  },
): Promise<Result<QuestionMergeOutput, AppError>> {
  const ranked = rankTopics(input.answers).slice(0, MAX_MERGE_TOPICS)
  // One label has nothing to be merged with; do not pay to be told so.
  if (ranked.length < 2) {
    return ok({ merge: {}, proposed: 0, usage: NO_USAGE, costMicroIdr: 0 })
  }

  const promptVersion = input.promptVersion ?? DEFAULT_MERGE_VERSION
  const groups = await askTwice(() =>
    adapter.mergeTopics({ question: input.question, topics: ranked, promptVersion }),
  )
  if (!groups.ok) return groups

  const proposed = resolveGroups(ranked, groups.value.groups)
  const pairs = Object.entries(proposed).map(([label, name]) => [name, label] as const)
  if (pairs.length === 0) {
    return ok({
      merge: {},
      proposed: 0,
      usage: groups.value.usage,
      costMicroIdr: groups.value.costMicroIdr,
    })
  }

  const verdicts = await askTwice(() =>
    adapter.confirmMerges({ question: input.question, pairs, promptVersion }),
  )
  if (!verdicts.ok) return verdicts

  return ok({
    merge: keepConfirmed(proposed, verdicts.value.verdicts),
    proposed: pairs.length,
    usage: {
      inputTokens: groups.value.usage.inputTokens + verdicts.value.usage.inputTokens,
      outputTokens: groups.value.usage.outputTokens + verdicts.value.usage.outputTokens,
    },
    costMicroIdr: groups.value.costMicroIdr + verdicts.value.costMicroIdr,
  })
}

export type JobMergeOutput = {
  merges: TopicMerges
  /** Questions whose merge could not be made; their topics stay as labelled. */
  failedQuestionIds: string[]
  usage: AdapterUsage
  costMicroIdr: number
}

/**
 * Merges the topics of every prose question of a job, each on its own: the
 * same word under two questions is two topics (pilot 01, §4.4).
 *
 * Never fails as a whole. A question whose call fails, or throws, keeps its
 * labels as they are, which is the report every job had before this existed.
 */
export async function mergeJobTopics(
  adapter: LlmAdapter,
  input: {
    questions: Readonly<Record<string, { text: string; mode: QuestionMode }>>
    results: ReadonlyArray<{ questionId: string; topics: readonly string[] }>
    promptVersion?: string
  },
): Promise<JobMergeOutput> {
  const answersOf = new Map<string, Array<readonly string[]>>()
  for (const result of input.results) {
    const question = input.questions[result.questionId]
    if (!question || !isMergeable(question.mode)) continue
    const answers = answersOf.get(result.questionId) ?? []
    answers.push(result.topics)
    answersOf.set(result.questionId, answers)
  }

  const output: JobMergeOutput = {
    merges: {},
    failedQuestionIds: [],
    usage: { ...NO_USAGE },
    costMicroIdr: 0,
  }

  await Promise.all(
    [...answersOf.entries()].map(async ([questionId, answers]) => {
      let merged: Result<QuestionMergeOutput, AppError>
      try {
        merged = await mergeQuestionTopics(adapter, {
          question: input.questions[questionId]?.text ?? '',
          answers,
          promptVersion: input.promptVersion,
        })
      } catch {
        output.failedQuestionIds.push(questionId)
        return
      }
      if (!merged.ok) {
        output.failedQuestionIds.push(questionId)
        return
      }

      output.usage.inputTokens += merged.value.usage.inputTokens
      output.usage.outputTokens += merged.value.usage.outputTokens
      output.costMicroIdr += merged.value.costMicroIdr
      if (Object.keys(merged.value.merge).length > 0) {
        output.merges[questionId] = merged.value.merge
      }
    }),
  )

  return output
}

/**
 * `analysis_jobs.topic_merges` on disk:
 *   { "prompt_version": "merge.v1",
 *     "questions": { "<question id>": { "percaya diri": "kepercayaan diri" } } }
 *
 * `{}` on a job from before merging, and on one whose topics needed none.
 */
export function toStoredTopicMerges(
  merges: TopicMerges,
  promptVersion: string = DEFAULT_MERGE_VERSION,
): { prompt_version: string; questions: TopicMerges } | Record<string, never> {
  return Object.keys(merges).length === 0
    ? {}
    : { prompt_version: promptVersion, questions: merges }
}

/**
 * Reads the column defensively: it is free-form jsonb and absent on a database
 * that has not had the migration. Anything that is not label-to-label is
 * dropped, and so is a label read as itself.
 */
export function readTopicMerges(value: unknown): TopicMerges {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const questions = (value as Record<string, unknown>).questions
  if (typeof questions !== 'object' || questions === null || Array.isArray(questions)) {
    return {}
  }

  const merges: TopicMerges = {}
  for (const [questionId, raw] of Object.entries(questions)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const merge: TopicMerge = {}
    for (const [label, name] of Object.entries(raw)) {
      if (typeof name !== 'string') continue
      const from = normalizeTopic(label)
      const to = normalizeTopic(name)
      if (from && to && from !== to) merge[from] = to
    }
    if (Object.keys(merge).length > 0) merges[questionId] = merge
  }
  return merges
}

/**
 * One answer's topics as the report counts them: each label read through the
 * merge, and a topic named twice — once under each of two merged labels —
 * kept once. Without a merge the labels come back untouched.
 */
export function applyTopicMerge(
  topics: readonly string[],
  merge: TopicMerge | undefined,
): string[] {
  if (!merge) return [...topics]

  const seen = new Set<string>()
  const merged: string[] = []
  for (const topic of topics) {
    const label = normalizeTopic(topic)
    const name = merge[label] ?? topic
    const key = normalizeTopic(name)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(name)
  }
  return merged
}

/** Which labels each merged topic stands for, for a report to say so. */
export function mergedLabels(
  merge: TopicMerge | undefined,
): Array<{ term: string; from: string[] }> {
  const groups = new Map<string, string[]>()
  for (const [label, name] of Object.entries(merge ?? {})) {
    groups.set(name, [...(groups.get(name) ?? []), label])
  }
  return [...groups.entries()]
    .map(([term, from]) => ({ term, from: from.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.term.localeCompare(b.term))
}
