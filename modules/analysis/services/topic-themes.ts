import { ok, type AppError, type Result } from '@/modules/shared'
import type { AdapterUsage, LlmAdapter } from '../adapters/types'
import { normalizeTopic } from '../postprocess/normalize'
import { DEFAULT_THEME_VERSION, type ProposedTheme } from '../prompts'
import { MAX_MERGE_TOPICS, askTwice, rankTopics } from './topic-merge'

/**
 * Themes over the topics of a critique question (C.4, ADR-0019).
 *
 * A theme is what a finding is written about. It is drawn when a report's
 * findings are written and kept with them; the topics, and the charts drawn
 * from them, do not change.
 */

/** A theme's name heads a card; longer than this is a sentence, not a name. */
const MAX_THEME_NAME = 60

/** Names the prompt forbids, refused here too: a theme of leftovers is no finding. */
const CATCH_ALL = new Set(['lainnya', 'lain-lain', 'umum', 'hal lain', 'lain lain'])

/** One theme, or one topic standing alone, with the labels it covers. */
export type ThemeGroup = {
  name: string
  /** Labels as the report counts them, most mentioned first. */
  topics: string[]
}

/**
 * Turns the model's themes into a grouping of every label on the list.
 *
 * As with the merge, the model is trusted for which labels belong together and
 * nothing else: a label that is not on the list is ignored, a label already
 * placed stays in its first theme, and a theme left with fewer than two labels
 * is dropped. Every label the model did not place stands as a theme of its own,
 * so a reply that groups nothing gives the topics back unchanged.
 */
export function resolveThemes(
  ranked: readonly string[],
  themes: readonly ProposedTheme[],
): ThemeGroup[] {
  const rankOf = new Map(ranked.map((label, rank) => [label, rank]))
  const placed = new Set<number>()
  const groups: Array<{ name: string; ranks: number[] }> = []

  for (const theme of themes) {
    const name = theme.name.replace(/\s+/g, ' ').trim().slice(0, MAX_THEME_NAME)
    if (CATCH_ALL.has(name.toLowerCase())) continue

    const ranks = [
      ...new Set(
        theme.topics
          .map((label) => rankOf.get(normalizeTopic(label)))
          .filter((rank): rank is number => rank !== undefined && !placed.has(rank)),
      ),
    ].sort((a, b) => a - b)
    if (ranks.length < 2) continue

    for (const rank of ranks) placed.add(rank)
    // A theme the model left unnamed goes by its most mentioned label.
    groups.push({ name: name || (ranked[ranks[0] as number] as string), ranks })
  }

  ranked.forEach((label, rank) => {
    if (!placed.has(rank)) groups.push({ name: label, ranks: [rank] })
  })

  return groups
    .sort((a, b) => (a.ranks[0] as number) - (b.ranks[0] as number))
    .map((group) => ({
      name: group.name,
      topics: group.ranks.map((rank) => ranked[rank] as string),
    }))
}

export type QuestionThemesOutput = {
  themes: ThemeGroup[]
  usage: AdapterUsage
  costMicroIdr: number
}

const NO_USAGE: AdapterUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * One question's themes, in one call. Labels past `MAX_MERGE_TOPICS` are not
 * sent and stand alone; so does every label when the call fails, which the
 * caller decides how to treat.
 */
export async function themeQuestionTopics(
  adapter: LlmAdapter,
  input: {
    question: string
    /** Each answer's topics, as the report counts them. */
    answers: ReadonlyArray<readonly string[]>
    promptVersion?: string
  },
): Promise<Result<QuestionThemesOutput, AppError>> {
  const ranked = rankTopics(input.answers)
  const sent = ranked.slice(0, MAX_MERGE_TOPICS)
  // One label has nothing to share a theme with; do not pay to be told so.
  if (sent.length < 2) {
    return ok({ themes: resolveThemes(ranked, []), usage: NO_USAGE, costMicroIdr: 0 })
  }

  const reply = await askTwice(() =>
    adapter.groupThemes({
      question: input.question,
      topics: sent,
      promptVersion: input.promptVersion ?? DEFAULT_THEME_VERSION,
    }),
  )
  if (!reply.ok) return reply

  return ok({
    themes: resolveThemes(ranked, reply.value.themes),
    usage: reply.value.usage,
    costMicroIdr: reply.value.costMicroIdr,
  })
}
