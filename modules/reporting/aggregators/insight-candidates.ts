import type { InsightSignal, Sentiment } from '@/types/domain'

/**
 * What a report has findings about (C.4, ADR-0019).
 *
 * The number of findings is not a setting. Pilot 01 rejected both a count
 * scaled to the size of the upload and a maximum the user picks
 * (pilot-01-findings.md §5): five hundred people complaining about one broken
 * air conditioner is one finding, and fifty people with ten complaints are ten.
 * So a finding is anything enough answers mention, and the report has as many
 * as the answers make.
 */

/** Mentioned by this many answers, a theme or topic is a finding... */
export const MIN_MENTIONS = 3
/** ...or by this share of the answers that name a topic, whichever is lower. */
export const MIN_SHARE = 0.05
/** A finding cites at least this many answers, or it is not one. */
export const MIN_EVIDENCE = 2
/** Quotes offered per finding: the floor, and one to choose instead. */
export const QUOTES_PER_CANDIDATE = 3

export const SPLIT_SHARE = 0.35
export const NEGATIVE_SHARE = 0.8
export const NEGATIVE_MIN_ANSWERS = 5

/**
 * Items written for one question. A guard on the size of one call, not a
 * measured limit: the pilot's longest list was 21.
 */
export const MAX_CANDIDATES = 40

/** A quote shorter than this is a label typed out ("percaya diri"), not a reason. */
const MIN_QUOTE_LENGTH = 20

export type CandidateRow = {
  responseId: string
  text: string
  sentiment: Sentiment | null
  /** As the report counts them: merged, lower case. */
  topics: readonly string[]
}

export type InsightCandidate = {
  /** A theme's name, or the topic itself. */
  name: string
  /** The labels it covers, most mentioned first. */
  topics: Array<{ term: string; count: number }>
  /** Answers that mention any of them. */
  support: number
  /** Only for a critique question. */
  sentimentCounts?: Record<Sentiment, number>
  signal: InsightSignal
  /** Answers the finding may cite, best first. */
  quoteIds: string[]
}

/**
 * "≥3 mentions or ≥5% of the answers that name a topic": the lower bar of
 * the two, and never below two, since a finding has to cite two answers.
 * Under sixty such answers 5% is the lower bar, which lets a small survey's
 * findings be about two or three people.
 */
export function mentionFloor(answersWithTopic: number): number {
  return Math.max(
    MIN_EVIDENCE,
    Math.min(MIN_MENTIONS, Math.ceil(answersWithTopic * MIN_SHARE)),
  )
}

export function signalOf(counts: Record<Sentiment, number>): InsightSignal {
  const total = counts.positive + counts.neutral + counts.negative
  if (total === 0) return 'topic'
  if (total >= NEGATIVE_MIN_ANSWERS && counts.negative / total > NEGATIVE_SHARE) {
    return 'negative'
  }
  if (counts.positive / total > SPLIT_SHARE && counts.negative / total > SPLIT_SHARE) {
    return 'split'
  }
  return 'topic'
}

/**
 * The answers a finding may quote, best first. An answer long enough to say
 * why comes before one that only names the topic. Within that, a critique
 * leads with its complaints — praise rarely says what to change — and a
 * split finding alternates, so both sides can be cited.
 */
function orderQuotes(
  rows: readonly CandidateRow[],
  signal: InsightSignal,
  evaluative: boolean,
): string[] {
  const usable = rows.filter((row) => row.text.trim().length > 0)
  const fuller = [
    ...usable.filter((row) => row.text.trim().length >= MIN_QUOTE_LENGTH),
    ...usable.filter((row) => row.text.trim().length < MIN_QUOTE_LENGTH),
  ]
  if (!evaluative) return fuller.map((row) => row.responseId)

  const negative = fuller.filter((row) => row.sentiment === 'negative')
  const rest = fuller.filter((row) => row.sentiment !== 'negative')
  if (signal !== 'split') return [...negative, ...rest].map((row) => row.responseId)

  const positive = rest.filter((row) => row.sentiment === 'positive')
  const neutral = rest.filter((row) => row.sentiment !== 'positive')
  const alternated: CandidateRow[] = []
  for (let i = 0; i < Math.max(negative.length, positive.length); i++) {
    if (negative[i]) alternated.push(negative[i] as CandidateRow)
    if (positive[i]) alternated.push(positive[i] as CandidateRow)
  }
  return [...alternated, ...neutral].map((row) => row.responseId)
}

/**
 * The findings of one question, most supported first.
 *
 * `groups` are the themes of a critique question, each with its labels; a
 * label in no group counts as a theme of its own. Without groups — a
 * reflection question, or a critique whose themes could not be drawn — every
 * topic stands alone.
 */
export function pickCandidates(input: {
  rows: readonly CandidateRow[]
  evaluative: boolean
  groups?: ReadonlyArray<{ name: string; topics: readonly string[] }>
}): InsightCandidate[] {
  const { rows, evaluative } = input

  const labelCounts = new Map<string, number>()
  for (const row of rows) {
    for (const topic of new Set(row.topics)) {
      labelCounts.set(topic, (labelCounts.get(topic) ?? 0) + 1)
    }
  }

  const groupOf = new Map<string, string>()
  const members = new Map<string, string[]>()
  for (const group of input.groups ?? []) {
    for (const topic of group.topics) {
      if (groupOf.has(topic) || !labelCounts.has(topic)) continue
      groupOf.set(topic, group.name)
      members.set(group.name, [...(members.get(group.name) ?? []), topic])
    }
  }
  for (const topic of labelCounts.keys()) {
    if (groupOf.has(topic)) continue
    // A lone label that shares a theme's name joins it rather than becoming a
    // second card with the same heading.
    groupOf.set(topic, topic)
    members.set(topic, [...(members.get(topic) ?? []), topic])
  }

  const rowsOf = new Map<string, CandidateRow[]>()
  for (const row of rows) {
    for (const name of new Set(row.topics.map((topic) => groupOf.get(topic) as string))) {
      rowsOf.set(name, [...(rowsOf.get(name) ?? []), row])
    }
  }

  const answersWithTopic = rows.filter((row) => row.topics.length > 0).length
  const floor = mentionFloor(answersWithTopic)

  const candidates: InsightCandidate[] = []
  for (const [name, backing] of rowsOf) {
    if (backing.length < floor) continue

    const counts = { positive: 0, neutral: 0, negative: 0 }
    for (const row of backing) if (row.sentiment) counts[row.sentiment] += 1
    const signal = evaluative ? signalOf(counts) : 'topic'

    candidates.push({
      name,
      topics: (members.get(name) ?? [])
        .map((term) => ({ term, count: labelCounts.get(term) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)),
      support: backing.length,
      ...(evaluative ? { sentimentCounts: counts } : {}),
      signal,
      quoteIds: orderQuotes(backing, signal, evaluative).slice(0, QUOTES_PER_CANDIDATE),
    })
  }

  return candidates
    .filter((candidate) => candidate.quoteIds.length >= MIN_EVIDENCE)
    .sort((a, b) => b.support - a.support || a.name.localeCompare(b.name))
    .slice(0, MAX_CANDIDATES)
}
