import type { z } from 'zod'
import type { AnalysisMode, QuestionMode } from '@/types/domain'
import type { RawBatchAnalysis } from '../adapters/types'
import * as analysisV1 from './analysis.v1'
import * as analysisV2 from './analysis.v2'
import * as analysisV3 from './analysis.v3'
import * as insightV1 from './insight.v1'
import * as mergeV1 from './merge.v1'
import * as modesV1 from './modes.v1'
import * as sentimentV1 from './sentiment.v1'
import * as summaryV1 from './summary.v1'
import * as summaryV2 from './summary.v2'
import * as summaryV3 from './summary.v3'
import * as summaryV4 from './summary.v4'
import * as themeV1 from './theme.v1'
import * as topicV1 from './topic.v1'

/**
 * Registry keyed by version. Prompts are never edited in place — a change means
 * a new .vN file plus a new entry here, so past results stay reproducible.
 *
 * 'v1' is the original three-prompt split. 'analysis.v1' folds all four
 * judgements into one call; 'analysis.v2' adds the `no_content` label (pilot
 * 01). 'analysis.v3' has a prompt per analysis mode and is what new jobs use.
 * Older versions stay resolvable so results already recorded against them can
 * be reproduced exactly.
 */
export const ANALYSIS_PROMPTS = {
  'analysis.v1': analysisV1,
  'analysis.v2': analysisV2,
  v1: sentimentV1,
} as const

/** Versions with one prompt per mode rather than one prompt. */
const MODE_AWARE_PROMPTS = { 'analysis.v3': analysisV3 } as const

export const SENTIMENT_PROMPTS = { v1: sentimentV1 } as const
export const TOPIC_PROMPTS = { v1: topicV1 } as const
export const SUMMARY_PROMPTS = {
  'summary.v1': summaryV1,
  'summary.v2': summaryV2,
  'summary.v3': summaryV3,
  'summary.v4': summaryV4,
  v1: summaryV1,
} as const
export const MODE_PROMPTS = { 'modes.v1': modesV1 } as const
export const MERGE_PROMPTS = { 'merge.v1': mergeV1 } as const
export const THEME_PROMPTS = { 'theme.v1': themeV1 } as const
export const INSIGHT_PROMPTS = { 'insight.v1': insightV1 } as const

/**
 * v4 is what new reports use: the paragraph only, with the findings written
 * from the data by insight.v1 (C.4).
 */
export const DEFAULT_SUMMARY_VERSION = 'summary.v4'

export const DEFAULT_PROMPT_VERSION = 'analysis.v3'

export const DEFAULT_MODE_VERSION = 'modes.v1'

export const DEFAULT_MERGE_VERSION = 'merge.v1'

export const DEFAULT_THEME_VERSION = 'theme.v1'

export const DEFAULT_INSIGHT_VERSION = 'insight.v1'

export type PromptVersion =
  keyof typeof ANALYSIS_PROMPTS | keyof typeof MODE_AWARE_PROMPTS

function isModeAware(value: string): value is keyof typeof MODE_AWARE_PROMPTS {
  return value in MODE_AWARE_PROMPTS
}

export function isPromptVersion(value: string): value is PromptVersion {
  return value in ANALYSIS_PROMPTS || isModeAware(value)
}

/**
 * Whether a job run with this prompt kept non-answers out of its results.
 * Before analysis.v2, "tidak ada" was sent to the model and came back
 * "neutral", so a count of 0 on those jobs means "not counted", not "none".
 */
export function separatesNoContent(version: string): boolean {
  return isPromptVersion(version) && version !== 'v1' && version !== 'analysis.v1'
}

/**
 * How a job on this prompt reads a question of the given mode. A version from
 * before modes has one prompt and asks everything for a sentiment, so on it
 * every question is `evaluative` whatever it was marked — which is what makes
 * a v2 run of a mixed dataset a fair comparison rather than an error.
 */
export function effectiveMode(version: string, mode: QuestionMode): QuestionMode {
  return isModeAware(version) ? mode : 'evaluative'
}

export type PromptContext = analysisV3.PromptContext

export type AnalysisPrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  /** Versions before analysis.v3 take the texts alone and ignore the rest. */
  readonly USER_TEMPLATE: (texts: string[], context?: PromptContext) => string
  readonly FEW_SHOT_MESSAGES: () => Array<{ role: 'user' | 'assistant'; content: string }>
  /**
   * Each version's own contract, normalized to one shape so callers never
   * branch on version or mode: only v2 and later may answer `no_content`, and
   * only an evaluative item carries a sentiment.
   */
  readonly OUTPUT_SCHEMA: z.ZodType<RawBatchAnalysis, z.ZodTypeDef, unknown>
}

/** sentiment.v1 predates few-shot messages; give it an empty set. */
const NO_FEW_SHOT = (): Array<{ role: 'user' | 'assistant'; content: string }> => []

/** The modes a model is asked about; a `scale` answer is read without one. */
export type PromptedMode = Exclude<QuestionMode, 'scale'>

export function analysisPrompt(
  version: string,
  mode: PromptedMode = 'evaluative',
): AnalysisPrompt {
  if (isModeAware(version)) {
    const prompt = MODE_AWARE_PROMPTS[version]
    return { PROMPT_VERSION: prompt.PROMPT_VERSION, ...prompt.MODES[mode] }
  }

  if (!(version in ANALYSIS_PROMPTS)) {
    throw new Error(`Unknown analysis prompt version: ${version}`)
  }

  const prompt = ANALYSIS_PROMPTS[version as keyof typeof ANALYSIS_PROMPTS]
  return {
    PROMPT_VERSION: prompt.PROMPT_VERSION,
    SYSTEM: prompt.SYSTEM,
    USER_TEMPLATE: prompt.USER_TEMPLATE,
    OUTPUT_SCHEMA: prompt.OUTPUT_SCHEMA,
    FEW_SHOT_MESSAGES:
      'FEW_SHOT_MESSAGES' in prompt ? prompt.FEW_SHOT_MESSAGES : NO_FEW_SHOT,
  }
}

export function sentimentPrompt(version: string) {
  if (!(version in SENTIMENT_PROMPTS)) {
    throw new Error(`Unknown sentiment prompt version: ${version}`)
  }
  return SENTIMENT_PROMPTS[version as keyof typeof SENTIMENT_PROMPTS]
}

/** v3's input is v2's plus the per-question digest, so one shape feeds them all. */
export type SummaryPromptInput = summaryV3.SummaryPromptInput
export type QuestionDigest = summaryV3.QuestionDigest

export type NormalizedInsight = {
  title: string
  detail: string
  /** 1-based positions into the sample quotes the prompt was given. */
  evidence: number[]
  /**
   * 1-based number of the question the insight is about; null when it spans
   * several, or when the prompt version does not say.
   */
  question: number | null
}

export type NormalizedSummary = {
  summary: string
  insights: NormalizedInsight[]
}

export type SummaryPrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  readonly USER_TEMPLATE: (input: SummaryPromptInput) => string
  readonly FEW_SHOT_MESSAGES: () => Array<{ role: 'user' | 'assistant'; content: string }>
  /** Each version normalizes to one shape, so callers never branch on version. */
  readonly parse: (value: unknown) => z.SafeParseReturnType<unknown, NormalizedSummary>
  /** Whether its insights name the question they come from. */
  readonly citesQuestions: boolean
  /**
   * Whether the findings are written apart, by insight.v1, from items picked
   * out of the data. Such a version returns no insights of its own.
   */
  readonly writesInsightsApart: boolean
}

/** v1 predates cited evidence; normalize it to the same shape with none. */
const summaryV1Schema = summaryV1.OUTPUT_SCHEMA.transform((value) => ({
  summary: value.summary,
  insights: value.insights.map((insight) => ({
    ...insight,
    evidence: [] as number[],
    question: null,
  })),
}))

const summaryV2Schema = summaryV2.OUTPUT_SCHEMA.transform((value) => ({
  summary: value.summary,
  insights: value.insights.map((insight) => ({ ...insight, question: null })),
}))

const summaryV3Schema = summaryV3.OUTPUT_SCHEMA.transform((value) => ({
  summary: value.summary,
  insights: value.insights.map((insight) => ({
    title: insight.title,
    detail: insight.detail,
    evidence: insight.evidence,
    question: insight.question ? insight.question : null,
  })),
}))

const summaryV4Schema = summaryV4.OUTPUT_SCHEMA.transform((value) => ({
  summary: value.summary,
  insights: [] as NormalizedInsight[],
}))

const SUMMARY_PROMPT_IMPLS: Record<keyof typeof SUMMARY_PROMPTS, SummaryPrompt> = {
  'summary.v1': {
    PROMPT_VERSION: summaryV1.PROMPT_VERSION,
    SYSTEM: summaryV1.SYSTEM,
    USER_TEMPLATE: summaryV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: NO_FEW_SHOT,
    parse: (value) => summaryV1Schema.safeParse(value),
    citesQuestions: false,
    writesInsightsApart: false,
  },
  v1: {
    PROMPT_VERSION: summaryV1.PROMPT_VERSION,
    SYSTEM: summaryV1.SYSTEM,
    USER_TEMPLATE: summaryV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: NO_FEW_SHOT,
    parse: (value) => summaryV1Schema.safeParse(value),
    citesQuestions: false,
    writesInsightsApart: false,
  },
  'summary.v2': {
    PROMPT_VERSION: summaryV2.PROMPT_VERSION,
    SYSTEM: summaryV2.SYSTEM,
    USER_TEMPLATE: summaryV2.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: summaryV2.FEW_SHOT_MESSAGES,
    parse: (value) => summaryV2Schema.safeParse(value),
    citesQuestions: false,
    writesInsightsApart: false,
  },
  'summary.v3': {
    PROMPT_VERSION: summaryV3.PROMPT_VERSION,
    SYSTEM: summaryV3.SYSTEM,
    USER_TEMPLATE: summaryV3.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: summaryV3.FEW_SHOT_MESSAGES,
    parse: (value) => summaryV3Schema.safeParse(value),
    citesQuestions: true,
    writesInsightsApart: false,
  },
  'summary.v4': {
    PROMPT_VERSION: summaryV4.PROMPT_VERSION,
    SYSTEM: summaryV4.SYSTEM,
    USER_TEMPLATE: summaryV4.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: summaryV4.FEW_SHOT_MESSAGES,
    parse: (value) => summaryV4Schema.safeParse(value),
    citesQuestions: true,
    writesInsightsApart: true,
  },
}

export function isSummaryPromptVersion(
  value: string,
): value is keyof typeof SUMMARY_PROMPTS {
  return value in SUMMARY_PROMPTS
}

export function summaryPrompt(version: string): SummaryPrompt {
  if (!isSummaryPromptVersion(version)) {
    throw new Error(`Unknown summary prompt version: ${version}`)
  }
  return SUMMARY_PROMPT_IMPLS[version]
}

export type ColumnDescription = modesV1.ColumnDescription
export type ColumnKind = modesV1.ColumnKind

export type ModePrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  readonly USER_TEMPLATE: (columns: readonly ColumnDescription[]) => string
  readonly FEW_SHOT_MESSAGES: () => Array<{ role: 'user' | 'assistant'; content: string }>
  /** The guesses by column index; an index the model skipped is absent. */
  readonly parse: (
    value: unknown,
  ) => z.SafeParseReturnType<unknown, Map<number, AnalysisMode>>
}

const modesV1Schema = modesV1.OUTPUT_SCHEMA.transform(
  (value) => new Map(value.columns.map((column) => [column.index, column.mode])),
)

export function modePrompt(version: string): ModePrompt {
  if (!(version in MODE_PROMPTS)) {
    throw new Error(`Unknown mode prompt version: ${version}`)
  }
  return {
    PROMPT_VERSION: modesV1.PROMPT_VERSION,
    SYSTEM: modesV1.SYSTEM,
    USER_TEMPLATE: modesV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: modesV1.FEW_SHOT_MESSAGES,
    parse: (value) => modesV1Schema.safeParse(value),
  }
}

export type MergePromptInput = mergeV1.MergePromptInput
export type ConfirmPromptInput = mergeV1.ConfirmPromptInput

/** What the second stage said about one pair, as the model wrote it. */
export type MergeVerdict = { a: string; b: string; same: boolean }

type Messages = () => Array<{ role: 'user' | 'assistant'; content: string }>

export type MergePrompt = {
  readonly PROMPT_VERSION: string
  /** Stage one: which labels of the list might name one thing. */
  readonly propose: {
    readonly SYSTEM: string
    readonly USER_TEMPLATE: (input: MergePromptInput) => string
    readonly FEW_SHOT_MESSAGES: Messages
    /** Groups of labels as the model wrote them; not yet checked against the list. */
    readonly parse: (value: unknown) => z.SafeParseReturnType<unknown, string[][]>
  }
  /** Stage two: each proposed pair, judged on its own. */
  readonly confirm: {
    readonly SYSTEM: string
    readonly USER_TEMPLATE: (input: ConfirmPromptInput) => string
    readonly FEW_SHOT_MESSAGES: Messages
    readonly parse: (value: unknown) => z.SafeParseReturnType<unknown, MergeVerdict[]>
  }
}

const mergeV1Groups = mergeV1.OUTPUT_SCHEMA.transform((value) => value.groups)
const mergeV1Verdicts = mergeV1.CONFIRM_OUTPUT_SCHEMA.transform((value) => value.pairs)

export function mergePrompt(version: string): MergePrompt {
  if (!(version in MERGE_PROMPTS)) {
    throw new Error(`Unknown merge prompt version: ${version}`)
  }
  return {
    PROMPT_VERSION: mergeV1.PROMPT_VERSION,
    propose: {
      SYSTEM: mergeV1.SYSTEM,
      USER_TEMPLATE: mergeV1.USER_TEMPLATE,
      FEW_SHOT_MESSAGES: mergeV1.FEW_SHOT_MESSAGES,
      parse: (value) => mergeV1Groups.safeParse(value),
    },
    confirm: {
      SYSTEM: mergeV1.CONFIRM_SYSTEM,
      USER_TEMPLATE: mergeV1.CONFIRM_USER_TEMPLATE,
      FEW_SHOT_MESSAGES: mergeV1.CONFIRM_FEW_SHOT_MESSAGES,
      parse: (value) => mergeV1Verdicts.safeParse(value),
    },
  }
}

export type ThemePromptInput = themeV1.ThemePromptInput

/** One theme as the model wrote it; not yet checked against the list. */
export type ProposedTheme = { name: string; topics: string[] }

export type ThemePrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  readonly USER_TEMPLATE: (input: ThemePromptInput) => string
  readonly FEW_SHOT_MESSAGES: Messages
  readonly parse: (value: unknown) => z.SafeParseReturnType<unknown, ProposedTheme[]>
}

const themeV1Themes = themeV1.OUTPUT_SCHEMA.transform((value) => value.themes)

export function themePrompt(version: string): ThemePrompt {
  if (!(version in THEME_PROMPTS)) {
    throw new Error(`Unknown theme prompt version: ${version}`)
  }
  return {
    PROMPT_VERSION: themeV1.PROMPT_VERSION,
    SYSTEM: themeV1.SYSTEM,
    USER_TEMPLATE: themeV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: themeV1.FEW_SHOT_MESSAGES,
    parse: (value) => themeV1Themes.safeParse(value),
  }
}

export type InsightPromptInput = insightV1.InsightPromptInput
export type InsightCandidateInput = insightV1.InsightCandidateInput
export type InsightSignal = insightV1.InsightSignal

/** One finding as the model wrote it; its candidate and quotes are unchecked. */
export type WrittenInsight = {
  candidate: number
  title: string
  detail: string
  evidence: number[]
}

export type InsightPrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  readonly USER_TEMPLATE: (input: InsightPromptInput) => string
  readonly FEW_SHOT_MESSAGES: Messages
  readonly parse: (value: unknown) => z.SafeParseReturnType<unknown, WrittenInsight[]>
}

const insightV1Insights = insightV1.OUTPUT_SCHEMA.transform((value) => value.insights)

export function insightPrompt(version: string): InsightPrompt {
  if (!(version in INSIGHT_PROMPTS)) {
    throw new Error(`Unknown insight prompt version: ${version}`)
  }
  return {
    PROMPT_VERSION: insightV1.PROMPT_VERSION,
    SYSTEM: insightV1.SYSTEM,
    USER_TEMPLATE: insightV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: insightV1.FEW_SHOT_MESSAGES,
    parse: (value) => insightV1Insights.safeParse(value),
  }
}
