import { z } from 'zod'
import type { AppError, Result } from '@/modules/shared'
import {
  sentimentSchema,
  type AnalysisMode,
  type QuestionMode,
  type Sentiment,
} from '@/types/domain'
import type { ColumnDescription, NormalizedSummary, SummaryPromptInput } from '../prompts'

/** One answer as analysis.v1 and analysis.v2 return it: always with a sentiment. */
export const analyzedItemSchema = z.object({
  /** Index within the submitted batch — lets us map results back to responses. */
  index: z.number().int().nonnegative(),
  sentiment: sentimentSchema,
  confidence: z.number().min(0).max(1),
  topics: z.array(z.string().min(1)).max(5),
  keywords: z.array(z.string().min(1)).max(8),
  summary: z.string().max(280),
})

/**
 * One analysed answer, whatever its question's mode. Only an `evaluative`
 * question has a sentiment to find (pilot 01, §3.1); for the others it and its
 * confidence are null, and `topics` holds what the mode counts — the choice
 * named, for a `categorical` question.
 */
export type AnalyzedItem = {
  index: number
  sentiment: Sentiment | null
  confidence: number | null
  topics: string[]
  keywords: string[]
  summary: string
}

export const batchAnalysisSchema = z.object({
  items: z.array(analyzedItemSchema),
})
export type BatchAnalysis = z.infer<typeof batchAnalysisSchema>

/**
 * From analysis.v2: the model may say a response holds no aspiration at all
 * ("tidak ada sih kak"). Nothing else about it is worth keeping, so anything
 * the model adds besides the index is dropped.
 */
export const noContentItemSchema = z.object({
  index: z.number().int().nonnegative(),
  sentiment: z.literal('no_content'),
})
export type NoContentItem = z.infer<typeof noContentItemSchema>

export const batchAnalysisV2Schema = z.object({
  items: z.array(z.union([analyzedItemSchema, noContentItemSchema])),
})

/** What any analysis prompt version may return, before the split. */
export type RawBatchAnalysis = { items: Array<AnalyzedItem | NoContentItem> }

export function isNoContentItem(
  item: AnalyzedItem | NoContentItem,
): item is NoContentItem {
  return item.sentiment === 'no_content'
}

export type BatchInput = {
  /** Sanitized response texts; batch-local order is meaningful. */
  texts: string[]
  promptVersion: string
  /**
   * How the question these answer is read. A prompt version from before modes
   * has one prompt and ignores it. `scale` never reaches an adapter: a number
   * needs no model.
   */
  mode?: Exclude<QuestionMode, 'scale'>
  /** What the respondent was asked, as context. Ignored before analysis.v3. */
  question?: string
  /**
   * Choices earlier batches of the same `categorical` question already named,
   * so one choice keeps one spelling across the whole question.
   */
  knownValues?: readonly string[]
}

export type AdapterUsage = {
  inputTokens: number
  outputTokens: number
}

export type SummaryInput = {
  /** Aggregate figures plus the quotes the model may cite. */
  data: SummaryPromptInput
  promptVersion: string
}

export type SummaryOutput = NormalizedSummary & {
  /**
   * Whether the prompt used asks each insight for its question. False means an
   * insight's `question` is null because nobody asked, not because it spans
   * several.
   */
  citesQuestions: boolean
  modelId: string
  usage: AdapterUsage
  costMicroIdr: number
}

export type BatchOutput = {
  items: AnalyzedItem[]
  /**
   * Batch-local indexes the model judged to hold no aspiration. Absent means
   * none: prompts before analysis.v2 cannot say so.
   */
  noContentIndexes?: number[]
  modelId: string
  usage: AdapterUsage
  /** Estimated spend for this call, in millionths of IDR. */
  costMicroIdr: number
}

export type ClassifyInput = {
  /** A header and what its column looks like — never a cell's contents. */
  columns: ColumnDescription[]
  promptVersion: string
}

export type ClassifyOutput = {
  /** One guess per column, in the order given; null where the model gave none. */
  modes: Array<AnalysisMode | null>
  modelId: string
  usage: AdapterUsage
  costMicroIdr: number
}

/**
 * Every LLM call in SAMOSA goes through this interface, so swapping OpenAI for
 * a local IndoBERT model is a wiring change rather than a rewrite.
 */
export type LlmAdapter = {
  readonly name: string
  analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>>
  /** One call per report, not per response: the executive narrative. */
  summarize(input: SummaryInput): Promise<Result<SummaryOutput, AppError>>
  /** One call per upload: what kind of answers each column of the sheet holds. */
  classifyColumns(input: ClassifyInput): Promise<Result<ClassifyOutput, AppError>>
}
