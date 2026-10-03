import 'server-only'

import OpenAI from 'openai'
import { serverEnv } from '@/lib/env'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { analysisPrompt, summaryPrompt, type AnalysisPrompt } from '../prompts'
import { estimateCostMicroIdr } from './pricing'
import { MAX_ATTEMPTS, backoffDelayMs, isRetryableError, retryAfterMs } from './retry'
import {
  isNoContentItem,
  type BatchInput,
  type BatchOutput,
  type LlmAdapter,
  type SummaryInput,
  type SummaryOutput,
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

  const failure = describeProviderFailure(lastError)
  return err(
    appError(ERROR_CODES.UPSTREAM, failure.message, {
      details: { status: failure.status, providerCode: failure.providerCode },
      cause: lastError,
    }),
  )
}

/**
 * Names the reason in words an admin can act on. Every batch of a job hits the
 * same key and the same model, so a configuration fault fails them all — and
 * "the request failed" alone sent us digging through a database to learn it
 * was a rejected key. Status and code are the provider's own labels, never the
 * response body, so nothing a user wrote can leak through here.
 */
function describeProviderFailure(cause: unknown): {
  message: string
  status?: number
  providerCode?: string
} {
  const fields = typeof cause === 'object' && cause !== null ? cause : {}
  const status =
    'status' in fields && typeof fields.status === 'number' ? fields.status : undefined
  const providerCode =
    'code' in fields && typeof fields.code === 'string' ? fields.code : undefined
  // OpenAI gives a malformed model name no code at all, only this text. It is
  // matched here, never echoed, so the rule above about bodies still holds.
  const invalidModel =
    status === 400 &&
    'message' in fields &&
    typeof fields.message === 'string' &&
    /invalid model/i.test(fields.message)

  const message = (() => {
    if (status === 401) return 'Kunci API OpenAI di server ditolak'
    if (providerCode === 'insufficient_quota') return 'Kuota atau saldo akun OpenAI habis'
    if (status === 429) return 'Penyedia AI sedang membatasi permintaan'
    if (status === 404 || providerCode === 'model_not_found') {
      return 'Model AI yang disetel di server tidak tersedia'
    }
    if (status === 403) return 'Akun OpenAI tidak diizinkan memakai model ini'
    if (invalidModel) return 'Nama model AI yang disetel di server tidak valid'
    // Reasoning models (gpt-5, o-series) refuse max_tokens and temperature 0.
    if (
      providerCode === 'unsupported_parameter' ||
      providerCode === 'unsupported_value'
    ) {
      return 'Model AI yang disetel di server tidak mendukung pengaturan analisis ini'
    }
    if (status === undefined) return 'Server tidak bisa menghubungi penyedia AI'
    return `Permintaan ke penyedia AI gagal (HTTP ${status}${providerCode ? `, ${providerCode}` : ''})`
  })()

  return { message, status, providerCode }
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

type ParsedBatch = Pick<BatchOutput, 'items' | 'noContentIndexes'>

function parseBatch(
  raw: string,
  schema: AnalysisPrompt['OUTPUT_SCHEMA'],
): Result<ParsedBatch, AppError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch (cause) {
    return err(
      appError(
        ERROR_CODES.UPSTREAM,
        'Model membalas dengan format yang tidak bisa dibaca',
        {
          cause,
        },
      ),
    )
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    return err(
      appError(
        ERROR_CODES.UPSTREAM,
        'Balasan model tidak sesuai format yang diharapkan',
        {
          details: { issues: result.error.issues.length },
        },
      ),
    )
  }

  const items: BatchOutput['items'] = []
  const noContentIndexes: number[] = []
  for (const item of result.data.items) {
    if (isNoContentItem(item)) noContentIndexes.push(item.index)
    else items.push(item)
  }
  return ok({ items, noContentIndexes })
}

/** The narrative is prose, not a per-response table, so it needs far less room. */
const MAX_SUMMARY_TOKENS = 1_024

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
        return err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI membalas tanpa isi'))
      }

      const parsed = parseBatch(content, prompt.OUTPUT_SCHEMA)
      if (!parsed.ok) return parsed

      const usage = {
        inputTokens: response.value.usage?.prompt_tokens ?? 0,
        outputTokens: response.value.usage?.completion_tokens ?? 0,
      }

      return ok({
        ...parsed.value,
        modelId,
        usage,
        costMicroIdr: estimateCostMicroIdr(modelId, usage),
      })
    },

    async summarize(input: SummaryInput): Promise<Result<SummaryOutput, AppError>> {
      const prompt = summaryPrompt(input.promptVersion)
      const modelId = serverEnv().OPENAI_MODEL

      const response = await callWithRetry(
        () =>
          getClient().chat.completions.create({
            model: modelId,
            max_tokens: MAX_SUMMARY_TOKENS,
            temperature: TEMPERATURE,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt.SYSTEM },
              ...prompt.FEW_SHOT_MESSAGES(),
              { role: 'user', content: prompt.USER_TEMPLATE(input.data) },
            ],
          }),
        options,
      )

      if (!response.ok) return response

      const content = response.value.choices[0]?.message.content
      if (!content) {
        return err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI membalas tanpa isi'))
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(stripCodeFence(content))
      } catch (cause) {
        return err(
          appError(
            ERROR_CODES.UPSTREAM,
            'Model membalas dengan format yang tidak bisa dibaca',
            {
              cause,
            },
          ),
        )
      }

      const summary = prompt.parse(parsed)
      if (!summary.success) {
        return err(
          appError(
            ERROR_CODES.UPSTREAM,
            'Balasan model tidak sesuai format yang diharapkan',
            {
              details: { issues: summary.error.issues.length },
            },
          ),
        )
      }

      const usage = {
        inputTokens: response.value.usage?.prompt_tokens ?? 0,
        outputTokens: response.value.usage?.completion_tokens ?? 0,
      }

      return ok({
        ...summary.data,
        modelId,
        usage,
        costMicroIdr: estimateCostMicroIdr(modelId, usage),
      })
    },
  }
}
