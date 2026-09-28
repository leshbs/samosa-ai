import type { z } from 'zod'
import * as analysisV1 from './analysis.v1'
import * as sentimentV1 from './sentiment.v1'
import * as summaryV1 from './summary.v1'
import * as summaryV2 from './summary.v2'
import * as topicV1 from './topic.v1'

/**
 * Registry keyed by version. Prompts are never edited in place — a change means
 * a new .vN file plus a new entry here, so past results stay reproducible.
 *
 * 'v1' is the original three-prompt split. 'analysis.v1' folds all four
 * judgements into one call and is what new jobs use; 'v1' stays resolvable so
 * results already recorded against it can be reproduced exactly.
 */
export const ANALYSIS_PROMPTS = {
  'analysis.v1': analysisV1,
  v1: sentimentV1,
} as const

export const SENTIMENT_PROMPTS = { v1: sentimentV1 } as const
export const TOPIC_PROMPTS = { v1: topicV1 } as const
export const SUMMARY_PROMPTS = {
  'summary.v1': summaryV1,
  'summary.v2': summaryV2,
  v1: summaryV1,
} as const

/** v2 is what new reports use: it cites the quotes behind each insight. */
export const DEFAULT_SUMMARY_VERSION = 'summary.v2'

export const DEFAULT_PROMPT_VERSION = 'analysis.v1'

export type PromptVersion = keyof typeof ANALYSIS_PROMPTS

export function isPromptVersion(value: string): value is PromptVersion {
  return value in ANALYSIS_PROMPTS
}

export type AnalysisPrompt = {
  readonly PROMPT_VERSION: string
  readonly SYSTEM: string
  readonly USER_TEMPLATE: (texts: string[]) => string
  readonly FEW_SHOT_MESSAGES: () => Array<{ role: 'user' | 'assistant'; content: string }>
}

/** sentiment.v1 predates few-shot messages; give it an empty set. */
const NO_FEW_SHOT = (): Array<{ role: 'user' | 'assistant'; content: string }> => []

export function analysisPrompt(version: string): AnalysisPrompt {
  if (!isPromptVersion(version)) {
    throw new Error(`Unknown analysis prompt version: ${version}`)
  }

  const prompt = ANALYSIS_PROMPTS[version]
  return {
    PROMPT_VERSION: prompt.PROMPT_VERSION,
    SYSTEM: prompt.SYSTEM,
    USER_TEMPLATE: prompt.USER_TEMPLATE,
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

export type SummaryPromptInput = summaryV2.SummaryPromptInput

export type NormalizedInsight = {
  title: string
  detail: string
  /** 1-based positions into the sample quotes the prompt was given. */
  evidence: number[]
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
}

/** v1 predates cited evidence; normalize it to the same shape with none. */
const summaryV1Schema = summaryV1.OUTPUT_SCHEMA.transform((value) => ({
  summary: value.summary,
  insights: value.insights.map((insight) => ({ ...insight, evidence: [] as number[] })),
}))

const SUMMARY_PROMPT_IMPLS: Record<keyof typeof SUMMARY_PROMPTS, SummaryPrompt> = {
  'summary.v1': {
    PROMPT_VERSION: summaryV1.PROMPT_VERSION,
    SYSTEM: summaryV1.SYSTEM,
    USER_TEMPLATE: summaryV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: NO_FEW_SHOT,
    parse: (value) => summaryV1Schema.safeParse(value),
  },
  v1: {
    PROMPT_VERSION: summaryV1.PROMPT_VERSION,
    SYSTEM: summaryV1.SYSTEM,
    USER_TEMPLATE: summaryV1.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: NO_FEW_SHOT,
    parse: (value) => summaryV1Schema.safeParse(value),
  },
  'summary.v2': {
    PROMPT_VERSION: summaryV2.PROMPT_VERSION,
    SYSTEM: summaryV2.SYSTEM,
    USER_TEMPLATE: summaryV2.USER_TEMPLATE,
    FEW_SHOT_MESSAGES: summaryV2.FEW_SHOT_MESSAGES,
    parse: (value) => summaryV2.OUTPUT_SCHEMA.safeParse(value),
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
