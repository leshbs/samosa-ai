import 'server-only'

import OpenAI from 'openai'
import { serverEnv } from '@/lib/env'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import {
  analysisPrompt,
  mergePrompt,
  modePrompt,
  summaryPrompt,
  type AnalysisPrompt,
} from '../prompts'
import { estimateCostMicroIdr } from './pricing'
import { MAX_ATTEMPTS, backoffDelayMs, isRetryableError, retryAfterMs } from './retry'
import {
  isNoContentItem,
  type AdapterUsage,
  type BatchInput,
  type BatchOutput,
  type ClassifyInput,
  type ClassifyOutput,
  type ConfirmInput,
  type ConfirmOutput,
  type LlmAdapter,
  type MergeInput,
  type MergeOutput,
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
          details: { malformedReply: true },
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
          details: describeIssues(result.error.issues),
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

/**
 * Which fields of a reply failed its schema, and how: "insights.2.title:
 * too_big". The count alone said that a reply was rejected and nothing about
 * why, which left a summary that failed one time in fifteen undiagnosable.
 *
 * Paths and codes only — never the values, which are respondents' words.
 *
 * `malformedReply` marks the failure as the model's reply rather than the
 * provider being unreachable: the request went through, so asking once more is
 * a different roll, not a hammering of something that is down.
 */
function describeIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; code: string }>,
): { malformedReply: true; issues: number; where: string[] } {
  return {
    malformedReply: true,
    issues: issues.length,
    where: issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.code}`),
  }
}

/**
 * The narrative is prose, not a per-response table, so it needs far less room.
 * Enough for six insights and a summary that covers several questions.
 */
const MAX_SUMMARY_TOKENS = 1_536

/** One short object per column of a sheet. */
const MAX_CLASSIFY_TOKENS = 1_024

/** A few numbers per group; room for a list of several hundred labels. */
const MAX_MERGE_TOKENS = 2_048

/** Reads a reply as JSON, or says the reply — not the provider — was at fault. */
function parseJson(content: string): Result<unknown, AppError> {
  try {
    return ok(JSON.parse(stripCodeFence(content)))
  } catch (cause) {
    return err(
      appError(
        ERROR_CODES.UPSTREAM,
        'Model membalas dengan format yang tidak bisa dibaca',
        {
          cause,
          details: { malformedReply: true },
        },
      ),
    )
  }
}

type Spent = { modelId: string; usage: AdapterUsage; costMicroIdr: number }

function malformed(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; code: string }>,
): AppError {
  return appError(
    ERROR_CODES.UPSTREAM,
    'Balasan model tidak sesuai format yang diharapkan',
    { details: describeIssues(issues) },
  )
}

/** One JSON-mode call: the reply as parsed JSON, and what it cost. */
async function askForJson(
  options: AdapterOptions,
  maxTokens: number,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<Result<{ json: unknown; spent: Spent }, AppError>> {
  const modelId = serverEnv().OPENAI_MODEL

  const response = await callWithRetry(
    () =>
      getClient().chat.completions.create({
        model: modelId,
        max_tokens: maxTokens,
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
        messages,
      }),
    options,
  )
  if (!response.ok) return response

  const content = response.value.choices[0]?.message.content
  if (!content) {
    return err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI membalas tanpa isi'))
  }

  const parsed = parseJson(content)
  if (!parsed.ok) return parsed

  const usage = {
    inputTokens: response.value.usage?.prompt_tokens ?? 0,
    outputTokens: response.value.usage?.completion_tokens ?? 0,
  }
  return ok({
    json: parsed.value,
    spent: { modelId, usage, costMicroIdr: estimateCostMicroIdr(modelId, usage) },
  })
}

export function createOpenAiAdapter(options: AdapterOptions = {}): LlmAdapter {
  return {
    name: 'openai',

    async analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>> {
      const prompt = analysisPrompt(input.promptVersion, input.mode)
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
              {
                role: 'user',
                content: prompt.USER_TEMPLATE(input.texts, {
                  question: input.question,
                  knownValues: input.knownValues,
                }),
              },
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

      const parsed = parseJson(content)
      if (!parsed.ok) return parsed

      const summary = prompt.parse(parsed.value)
      if (!summary.success) {
        return err(
          appError(
            ERROR_CODES.UPSTREAM,
            'Balasan model tidak sesuai format yang diharapkan',
            {
              details: describeIssues(summary.error.issues),
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
        citesQuestions: prompt.citesQuestions,
        modelId,
        usage,
        costMicroIdr: estimateCostMicroIdr(modelId, usage),
      })
    },

    async classifyColumns(
      input: ClassifyInput,
    ): Promise<Result<ClassifyOutput, AppError>> {
      const prompt = modePrompt(input.promptVersion)
      const modelId = serverEnv().OPENAI_MODEL

      const response = await callWithRetry(
        () =>
          getClient().chat.completions.create({
            model: modelId,
            max_tokens: MAX_CLASSIFY_TOKENS,
            temperature: TEMPERATURE,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt.SYSTEM },
              ...prompt.FEW_SHOT_MESSAGES(),
              { role: 'user', content: prompt.USER_TEMPLATE(input.columns) },
            ],
          }),
        options,
      )

      if (!response.ok) return response

      const content = response.value.choices[0]?.message.content
      if (!content) {
        return err(appError(ERROR_CODES.UPSTREAM, 'Penyedia AI membalas tanpa isi'))
      }

      const parsed = parseJson(content)
      if (!parsed.ok) return parsed

      const guesses = prompt.parse(parsed.value)
      if (!guesses.success) {
        return err(
          appError(
            ERROR_CODES.UPSTREAM,
            'Balasan model tidak sesuai format yang diharapkan',
            { details: describeIssues(guesses.error.issues) },
          ),
        )
      }

      const usage = {
        inputTokens: response.value.usage?.prompt_tokens ?? 0,
        outputTokens: response.value.usage?.completion_tokens ?? 0,
      }

      return ok({
        modes: input.columns.map((_, index) => guesses.data.get(index) ?? null),
        modelId,
        usage,
        costMicroIdr: estimateCostMicroIdr(modelId, usage),
      })
    },

    async mergeTopics(input: MergeInput): Promise<Result<MergeOutput, AppError>> {
      const prompt = mergePrompt(input.promptVersion).propose
      const reply = await askForJson(options, MAX_MERGE_TOKENS, [
        { role: 'system', content: prompt.SYSTEM },
        ...prompt.FEW_SHOT_MESSAGES(),
        { role: 'user', content: prompt.USER_TEMPLATE(input) },
      ])
      if (!reply.ok) return reply

      const groups = prompt.parse(reply.value.json)
      if (!groups.success) return err(malformed(groups.error.issues))

      return ok({ groups: groups.data, ...reply.value.spent })
    },

    async confirmMerges(input: ConfirmInput): Promise<Result<ConfirmOutput, AppError>> {
      const prompt = mergePrompt(input.promptVersion).confirm
      const reply = await askForJson(options, MAX_MERGE_TOKENS, [
        { role: 'system', content: prompt.SYSTEM },
        ...prompt.FEW_SHOT_MESSAGES(),
        { role: 'user', content: prompt.USER_TEMPLATE(input) },
      ])
      if (!reply.ok) return reply

      const verdicts = prompt.parse(reply.value.json)
      if (!verdicts.success) return err(malformed(verdicts.error.issues))

      return ok({ verdicts: verdicts.data, ...reply.value.spent })
    },
  }
}
