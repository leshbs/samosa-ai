/**
 * Cost estimation. Kept out of the adapter so the rates can be reviewed and
 * updated without touching request logic, and so the maths is unit-testable
 * without an SDK in the way.
 *
 * Rates are USD per million tokens, as published by OpenAI. They are a snapshot:
 * a wrong rate makes the cost column wrong, never the analysis.
 */
export type ModelRate = {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

const RATES: Record<string, ModelRate> = {
  'gpt-4o-mini': { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  'gpt-4o': { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  'gpt-4.1-mini': { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 },
  'gpt-4.1': { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
}

/** Unknown models fall back to the default model's rate rather than reporting 0. */
const FALLBACK_RATE = RATES['gpt-4o-mini'] as ModelRate

/**
 * A fixed rate keeps stored costs comparable across a research run. A live FX
 * feed would make two jobs on the same dataset disagree for no useful reason.
 */
export const USD_TO_IDR = 16_500

export function rateFor(modelId: string): ModelRate {
  // Deployment ids often carry a date suffix (gpt-4o-mini-2024-07-18).
  const exact = RATES[modelId]
  if (exact) return exact

  const prefixed = Object.keys(RATES)
    .filter((known) => modelId.startsWith(known))
    // Longest match wins, so gpt-4.1-mini-x does not price as gpt-4.1.
    .sort((a, b) => b.length - a.length)[0]

  return prefixed ? (RATES[prefixed] as ModelRate) : FALLBACK_RATE
}

/**
 * Returns millionths of a rupiah. Integer arithmetic at the end: summing
 * thousands of floating-point batch costs drifts, and money should not drift.
 */
export function estimateCostMicroIdr(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const rate = rateFor(modelId)
  const usd =
    (usage.inputTokens / 1_000_000) * rate.inputUsdPerMillion +
    (usage.outputTokens / 1_000_000) * rate.outputUsdPerMillion

  return Math.round(usd * USD_TO_IDR * 1_000_000)
}

export function formatIdr(microIdr: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(microIdr / 1_000_000)
}

/**
 * Measured against analysis.v1 on Indonesian aspirations: roughly 120 input
 * tokens per response once the framing tags are counted, ~55 output tokens for
 * the JSON, plus the few-shot exchange re-sent with every batch.
 */
const INPUT_TOKENS_PER_RESPONSE = 120
const OUTPUT_TOKENS_PER_RESPONSE = 55
const FEW_SHOT_TOKENS_PER_BATCH = 900

/**
 * Up-front estimate for the confirmation dialog. Deliberately rough and
 * rounded up — a user who is told Rp 180 and charged Rp 210 loses trust in
 * every number the app shows them.
 */
export function estimateJobCostMicroIdr(
  modelId: string,
  responseCount: number,
  batchSize: number,
): number {
  const batches = Math.ceil(responseCount / batchSize)

  return estimateCostMicroIdr(modelId, {
    inputTokens:
      responseCount * INPUT_TOKENS_PER_RESPONSE + batches * FEW_SHOT_TOKENS_PER_BATCH,
    outputTokens: responseCount * OUTPUT_TOKENS_PER_RESPONSE,
  })
}

/** Batches run 4-wide; a batch takes roughly 8 seconds end to end. */
export function estimateJobSeconds(responseCount: number, batchSize: number): number {
  const batches = Math.ceil(responseCount / batchSize)
  return Math.max(5, Math.ceil(batches / 4) * 8)
}
