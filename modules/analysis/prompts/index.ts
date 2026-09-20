import * as analysisV1 from './analysis.v1'
import * as sentimentV1 from './sentiment.v1'
import * as summaryV1 from './summary.v1'
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
export const SUMMARY_PROMPTS = { v1: summaryV1 } as const

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

export function summaryPrompt(version: string) {
  if (!(version in SUMMARY_PROMPTS)) {
    throw new Error(`Unknown summary prompt version: ${version}`)
  }
  return SUMMARY_PROMPTS[version as keyof typeof SUMMARY_PROMPTS]
}
