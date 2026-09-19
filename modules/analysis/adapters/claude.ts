import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { serverEnv } from '@/lib/env'
import { sentimentPrompt } from '../prompts'
import {
  ERROR_CODES,
  appError,
  err,
  fromPromise,
  ok,
  type Result,
} from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  batchAnalysisSchema,
  type BatchInput,
  type BatchOutput,
  type LlmAdapter,
} from './types'

const MAX_OUTPUT_TOKENS = 4_096
/** Deterministic output keeps research runs comparable across executions. */
const TEMPERATURE = 0

let client: Anthropic | undefined

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY })
  return client
}

/** Models sometimes wrap JSON in a code fence despite the instruction not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
}

function parseBatch(raw: string): Result<BatchOutput['items'], AppError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch (cause) {
    return err(
      appError(ERROR_CODES.UPSTREAM, 'Model returned output that is not valid JSON', {
        cause,
      }),
    )
  }

  const result = batchAnalysisSchema.safeParse(parsed)
  if (!result.success) {
    return err(
      appError(ERROR_CODES.UPSTREAM, 'Model output did not match the expected schema', {
        details: { issues: result.error.issues.length },
      }),
    )
  }

  return ok(result.data.items)
}

export function createClaudeAdapter(): LlmAdapter {
  return {
    name: 'claude',

    async analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>> {
      const prompt = sentimentPrompt(input.promptVersion)
      const modelId = serverEnv().ANTHROPIC_MODEL

      const response = await fromPromise(
        getClient().messages.create({
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: TEMPERATURE,
          system: prompt.SYSTEM,
          messages: [{ role: 'user', content: prompt.USER_TEMPLATE(input.texts) }],
        }),
        (cause) => appError(ERROR_CODES.UPSTREAM, 'Claude API request failed', { cause }),
      )

      if (!response.ok) return response

      const textBlock = response.value.content.find((block) => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        return err(
          appError(ERROR_CODES.UPSTREAM, 'Claude response contained no text block'),
        )
      }

      const items = parseBatch(textBlock.text)
      if (!items.ok) return items

      return ok({
        items: items.value,
        modelId,
        usage: {
          inputTokens: response.value.usage.input_tokens,
          outputTokens: response.value.usage.output_tokens,
        },
      })
    },
  }
}
