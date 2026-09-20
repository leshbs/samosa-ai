import 'server-only'

import OpenAI from 'openai'
import { serverEnv } from '@/lib/env'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { analysisPrompt } from '../prompts'
import { estimateCostMicroIdr } from './pricing'
import { MAX_ATTEMPTS, backoffDelayMs, isRetryableError, retryAfterMs } from './retry'
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

/** Seams for tests, so retry behaviour can be exercised without real waiting. */
export type AdapterOptions = {
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Rate limits and 5xx are the normal weather of a long analysis run, not a
 * reason to fail a batch. Anything else (a bad request, a revoked key) fails
 * immediately — retrying it would just burn the budget three times over.
 */
async function callWithRetry<T>(
  call: () => Promise<T>,
  options: AdapterOptions,
): Promise<Result<T, AppError>> {
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return ok(await call())
    } catch (cause) {
      lastError = cause
      if (!isRetryableError(cause) || attempt === MAX_ATTEMPTS - 1) break
      await sleep(retryAfterMs(cause) ?? backoffDelayMs(attempt, random))
    }
  }

  return err(
    appError(ERROR_CODES.UPSTREAM, 'OpenAI API request failed', { cause: lastError }),
  )
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

export function createOpenAiAdapter(options: AdapterOptions = {}): LlmAdapter {
  return {
    name: 'openai',

    async analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>> {
      const prompt = analysisPrompt(input.promptVersion)
      const modelId = serverEnv().OPENAI_MODEL

      const response = await callWithRetry(
        () =>
          getClient().chat.completions.create({
            model: modelId,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: TEMPERATURE,
            // JSON mode: the model is constrained to emit a syntactically valid
            // object, which removes the most common class of parse failure.
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt.SYSTEM },
              ...prompt.FEW_SHOT_MESSAGES(),
              { role: 'user', content: prompt.USER_TEMPLATE(input.texts) },
            ],
          }),
        options,
      )

      if (!response.ok) return response

      const content = response.value.choices[0]?.message.content
      if (!content) {
        return err(appError(ERROR_CODES.UPSTREAM, 'OpenAI response contained no content'))
      }

      const items = parseBatch(content)
      if (!items.ok) return items

      const usage = {
        inputTokens: response.value.usage?.prompt_tokens ?? 0,
        outputTokens: response.value.usage?.completion_tokens ?? 0,
      }

      return ok({
        items: items.value,
        modelId,
        usage,
        costMicroIdr: estimateCostMicroIdr(modelId, usage),
      })
    },
  }
}
