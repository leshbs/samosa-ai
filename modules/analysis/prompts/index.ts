import * as sentimentV1 from './sentiment.v1'
import * as summaryV1 from './summary.v1'
import * as topicV1 from './topic.v1'

/**
 * Registry keyed by version. Prompts are never edited in place — a change means
 * a new .vN file plus a new entry here, so past results stay reproducible.
 */
export const SENTIMENT_PROMPTS = { v1: sentimentV1 } as const
export const TOPIC_PROMPTS = { v1: topicV1 } as const
export const SUMMARY_PROMPTS = { v1: summaryV1 } as const

export const DEFAULT_PROMPT_VERSION = 'v1'

export type PromptVersion = keyof typeof SENTIMENT_PROMPTS

export function isPromptVersion(value: string): value is PromptVersion {
  return value in SENTIMENT_PROMPTS
}

export function sentimentPrompt(version: string) {
  if (!isPromptVersion(version)) {
    throw new Error(`Unknown sentiment prompt version: ${version}`)
  }
  return SENTIMENT_PROMPTS[version]
}

export function summaryPrompt(version: string) {
  if (!isPromptVersion(version)) {
    throw new Error(`Unknown summary prompt version: ${version}`)
  }
  return SUMMARY_PROMPTS[version]
}
