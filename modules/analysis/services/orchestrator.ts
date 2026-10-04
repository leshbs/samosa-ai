import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { QuestionMode } from '@/types/domain'
import type { AnalyzedItem, BatchOutput, LlmAdapter } from '../adapters/types'
import { normalizeTopic } from '../postprocess/normalize'
import { BATCH_SIZE, chunk, planBatches, type PreparedBatch } from './batcher'

export { BATCH_SIZE, chunk }

/** Batches run concurrently; 4 stays inside typical provider rate limits. */
export const MAX_CONCURRENCY = 4

export type OrchestratorInput = {
  jobId: string
  promptVersion: string
  /** `questionId` keeps answers to different questions out of each other's batches. */
  responses: ReadonlyArray<{ id: string; text: string; questionId?: string }>
  /**
   * What each question asked and how it is read, by question id. A question
   * that is absent — or the whole map, for a caller from before modes — is
   * `evaluative` with no question text. The caller passes modes the prompt
   * version can honour (see `effectiveMode`).
   */
  questions?: Readonly<Record<string, { text: string; mode: QuestionMode }>>
  /**
   * Called as each batch lands, so a long job can show progress. Fired from the
   * batch loop, so it must not throw — failures are logged and swallowed.
   */
  onProgress?: (progress: { processed: number; total: number }) => Promise<void> | void
}

export type AnalyzedResponse = AnalyzedItem & { responseId: string }

export type OrchestratorOutput = {
  results: AnalyzedResponse[]
  modelId: string
  totalInputTokens: number
  totalOutputTokens: number
  costMicroIdr: number
  /** Responses whose batch failed; the caller decides whether to retry. */
  failedResponseIds: string[]
  /**
   * Responses that hold no aspiration: dropped before the model (empty, or an
   * exact non-answer like "tidak ada"), or labelled `no_content` by it. No
   * result row, and out of every percentage — but counted, so the report can
   * say how many respondents answered.
   */
  noContentResponseIds: string[]
}

/** Runs tasks with a bounded number in flight, preserving result order. */
async function withConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index]
      if (item === undefined) continue
      results[index] = await task(item, index)
    }
  })

  await Promise.all(workers)
  return results
}

type BatchOutcome = { batch: PreparedBatch; outcome: Result<BatchOutput, AppError> }

/**
 * Batches that must run one after another. Every batch is a lane of its own,
 * except the batches of one `categorical` question: each is told the choices
 * the ones before it named, so "outbound" in the first thirty answers is not
 * "kegiatan outbound" in the next thirty. Lanes still run side by side.
 */
function intoLanes(batches: readonly PreparedBatch[]): PreparedBatch[][] {
  const lanes: PreparedBatch[][] = []
  const chains = new Map<string | null, PreparedBatch[]>()

  for (const batch of batches) {
    if (batch.mode !== 'categorical') {
      lanes.push([batch])
      continue
    }
    const chain = chains.get(batch.questionId)
    if (chain) chain.push(batch)
    else {
      const started = [batch]
      chains.set(batch.questionId, started)
      lanes.push(started)
    }
  }

  return lanes
}

/** Most named first, so the list the next batch sees leads with the real choices. */
function rankedValues(counts: ReadonlyMap<string, number>): string[] {
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

/**
 * Fans a dataset out across batched LLM calls and stitches the results back to
 * their response ids. A failed batch degrades that batch only — a 500-row job
 * should not be lost because one request timed out.
 */
export async function analyzeResponses(
  adapter: LlmAdapter,
  input: OrchestratorInput,
): Promise<Result<OrchestratorOutput, AppError>> {
  if (input.responses.length === 0) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Dataset ini tidak punya aspirasi untuk dianalisis',
      ),
    )
  }

  const log = logger.child({ jobId: input.jobId, adapter: adapter.name })
  const questions = input.questions ?? {}
  const plan = planBatches(
    input.responses,
    BATCH_SIZE,
    (questionId) =>
      (questionId ? questions[questionId]?.mode : undefined) ?? 'evaluative',
  )

  if (plan.batches.length === 0 && plan.values.length === 0) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Tidak ada aspirasi di dataset ini — semua jawabannya kosong atau "tidak ada"',
      ),
    )
  }

  log.info('analysis.batches.created', {
    batches: plan.batches.length,
    skipped: plan.skippedIds.length,
    truncated: plan.truncatedIds.length,
    flagged: plan.flaggedIds.length,
    readWithoutModel: plan.values.length,
  })

  // Numbers were read while planning, so they are done before the first call.
  const analyzableCount =
    plan.values.length + plan.batches.reduce((sum, batch) => sum + batch.items.length, 0)
  let processed = plan.values.length

  const runBatch = async (
    batch: PreparedBatch,
    knownValues?: readonly string[],
  ): Promise<BatchOutcome> => {
    const request = {
      texts: batch.items.map((item) => item.text),
      promptVersion: input.promptVersion,
      mode: batch.mode,
      question: batch.questionId ? questions[batch.questionId]?.text : undefined,
      knownValues,
    }

    /**
     * An adapter answers with a Result, and a thrown error must still cost one
     * batch rather than the job: unguarded, it rejects the whole run, every
     * batch that did land is thrown away, and the job sits at `running` until
     * the sweeper finds it.
     */
    const ask = async (): Promise<Result<BatchOutput, AppError>> => {
      try {
        return await adapter.analyzeBatch(request)
      } catch (cause) {
        return err(
          appError(ERROR_CODES.UPSTREAM, 'Adapter analisis berhenti tak terduga', {
            cause,
            details: { thrown: String(cause) },
          }),
        )
      }
    }

    let outcome = await ask()

    /**
     * One more ask when the model's reply broke the output format. The request
     * went through, so the same request again is a fresh draw rather than a
     * hammering of something that is down — and without it one stray reply
     * marks thirty answers as failed. An unreachable provider is not retried
     * here: the adapter has already done that.
     */
    if (!outcome.ok && outcome.error.details?.malformedReply === true) {
      log.warn('analysis.batch.retrying', {
        reason: outcome.error.message,
        ...outcome.error.details,
      })
      outcome = await ask()
    }

    // Progress counts attempted work, so a failing batch still advances the
    // bar rather than leaving the user watching a stalled job.
    processed += batch.items.length
    if (input.onProgress) {
      try {
        await input.onProgress({ processed, total: analyzableCount })
      } catch (cause) {
        log.warn('analysis.progress.failed', { cause: String(cause) })
      }
    }

    return { batch, outcome }
  }

  const laneOutcomes = await withConcurrency(
    intoLanes(plan.batches),
    MAX_CONCURRENCY,
    async (lane) => {
      const outcomes: BatchOutcome[] = []
      const named = new Map<string, number>()

      for (const batch of lane) {
        const done = await runBatch(
          batch,
          batch.mode === 'categorical' ? rankedValues(named) : undefined,
        )
        outcomes.push(done)

        if (batch.mode === 'categorical' && done.outcome.ok) {
          for (const item of done.outcome.value.items) {
            for (const raw of item.topics) {
              const value = normalizeTopic(raw)
              if (value) named.set(value, (named.get(value) ?? 0) + 1)
            }
          }
        }
      }

      return outcomes
    },
  )
  const batchOutcomes = laneOutcomes.flat()

  const results: AnalyzedResponse[] = plan.values.map((read) => ({
    responseId: read.id,
    index: 0,
    sentiment: null,
    confidence: null,
    topics: [read.value],
    keywords: [],
    summary: '',
  }))
  const failedResponseIds: string[] = []
  const noContentResponseIds: string[] = [...plan.skippedIds]
  let modelId = adapter.name
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let costMicroIdr = 0
  let firstFailure: AppError | undefined

  for (const { batch, outcome } of batchOutcomes) {
    if (!outcome.ok) {
      log.error('analysis.batch.failed', {
        code: outcome.error.code,
        reason: outcome.error.message,
        ...outcome.error.details,
      })
      firstFailure ??= outcome.error
      failedResponseIds.push(...batch.items.map((item) => item.id))
      continue
    }

    modelId = outcome.value.modelId
    totalInputTokens += outcome.value.usage.inputTokens
    totalOutputTokens += outcome.value.usage.outputTokens
    costMicroIdr += outcome.value.costMicroIdr

    for (const item of outcome.value.items) {
      const response = batch.items[item.index]
      if (!response) {
        log.warn('analysis.item.orphaned', { index: item.index })
        continue
      }
      results.push({ ...item, responseId: response.id })
    }

    for (const index of outcome.value.noContentIndexes ?? []) {
      const response = batch.items[index]
      if (response) noContentResponseIds.push(response.id)
    }
  }

  if (results.length === 0 && failedResponseIds.length === 0) {
    // Every batch answered and none of it was an aspiration. Not a failure of
    // the model, and not a report either: there is nothing to chart.
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Tidak ada aspirasi di dataset ini — semua jawabannya kosong atau "tidak ada"',
      ),
    )
  }

  if (results.length === 0) {
    // Batches share one key and one model, so when all of them fail the first
    // reason is almost always everyone's reason — and it is the part the job's
    // error message needs for anyone to fix it.
    const reason = firstFailure ? ` — ${firstFailure.message}` : ''
    return err(
      appError(ERROR_CODES.UPSTREAM, `Semua batch analisis gagal${reason}`, {
        details: firstFailure?.details,
      }),
    )
  }

  return ok({
    results,
    modelId,
    totalInputTokens,
    totalOutputTokens,
    costMicroIdr,
    failedResponseIds,
    noContentResponseIds,
  })
}
