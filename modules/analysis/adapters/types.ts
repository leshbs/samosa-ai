import { z } from 'zod'
import type { AppError, Result } from '@/modules/shared'
import { sentimentSchema } from '@/types/domain'

export const analyzedItemSchema = z.object({
  /** Index within the submitted batch — lets us map results back to responses. */
  index: z.number().int().nonnegative(),
  sentiment: sentimentSchema,
  confidence: z.number().min(0).max(1),
  topics: z.array(z.string().min(1)).max(5),
  keywords: z.array(z.string().min(1)).max(8),
  summary: z.string().max(280),
})
export type AnalyzedItem = z.infer<typeof analyzedItemSchema>

export const batchAnalysisSchema = z.object({
  items: z.array(analyzedItemSchema),
})
export type BatchAnalysis = z.infer<typeof batchAnalysisSchema>

export type BatchInput = {
  /** Sanitized response texts; batch-local order is meaningful. */
  texts: string[]
  promptVersion: string
}

export type AdapterUsage = {
  inputTokens: number
  outputTokens: number
}

export type BatchOutput = {
  items: AnalyzedItem[]
  modelId: string
  usage: AdapterUsage
  /** Estimated spend for this call, in millionths of IDR. */
  costMicroIdr: number
}

/**
 * Every LLM call in SAMOSA goes through this interface, so swapping OpenAI for
 * a local IndoBERT model is a wiring change rather than a rewrite.
 */
export type LlmAdapter = {
  readonly name: string
  analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>>
}
