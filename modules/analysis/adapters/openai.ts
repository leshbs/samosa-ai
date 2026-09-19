import 'server-only'

import OpenAI from 'openai'
import { serverEnv } from '@/lib/env'
import {
  ERROR_CODES,
  appError,
  err,
  fromPromise,
  ok,
  type Result,
} from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { sentimentPrompt } from '../prompts'
import {
  batchAnalysisSchema,
  type BatchInput,
  type BatchOutput,
  type LlmAdapter,
} from './types'

const MAX_OUTPUT_TOKENS = 4_096
/** Deterministic output keeps research runs comparable across executions. */
const TEMPERATURE = 0

let client: OpenAI | undefined

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY })
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

export function createOpenAiAdapter(): LlmAdapter {
  return {
    name: 'openai',

    async analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>> {
      const prompt = sentimentPrompt(input.promptVersion)
      const modelId = serverEnv().OPENAI_MODEL

      const response = await fromPromise(
        getClient().chat.completions.create({
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: TEMPERATURE,
          // JSON mode: the model is constrained to emit a syntactically valid
          // object, which removes the most common class of parse failure.
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.SYSTEM },
            { role: 'user', content: prompt.USER_TEMPLATE(input.texts) },
          ],
        }),
        (cause) => appError(ERROR_CODES.UPSTREAM, 'OpenAI API request failed', { cause }),
      )

      if (!response.ok) return response

      const content = response.value.choices[0]?.message.content
      if (!content) {
        return err(appError(ERROR_CODES.UPSTREAM, 'OpenAI response contained no content'))
      }

      const items = parseBatch(content)
      if (!items.ok) return items

      return ok({
        items: items.value,
        modelId,
        usage: {
          inputTokens: response.value.usage?.prompt_tokens ?? 0,
          outputTokens: response.value.usage?.completion_tokens ?? 0,
        },
      })
    },
  }
}
