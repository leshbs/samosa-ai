import { ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { BatchInput, BatchOutput, LlmAdapter } from './types'

const POSITIVE_CUES = ['bagus', 'baik', 'seru', 'puas', 'mantap', 'suka', 'keren']
const NEGATIVE_CUES = ['buruk', 'jelek', 'kecewa', 'telat', 'lambat', 'susah', 'kurang']

/**
 * Lexicon baseline standing in for a future IndoBERT deployment. It exists so
 * the pipeline can run without network access (tests, offline demos) and so the
 * paper has a non-LLM baseline to compare against.
 */
export function createLocalAdapter(): LlmAdapter {
  return {
    name: 'local-lexicon',

    async analyzeBatch(input: BatchInput): Promise<Result<BatchOutput, AppError>> {
      const items = input.texts.map((text, index) => {
        const lower = text.toLowerCase()
        const positives = POSITIVE_CUES.filter((cue) => lower.includes(cue)).length
        const negatives = NEGATIVE_CUES.filter((cue) => lower.includes(cue)).length
        const sentiment =
          positives > negatives
            ? 'positive'
            : negatives > positives
              ? 'negative'
              : 'neutral'

        return {
          index,
          sentiment,
          confidence: positives === negatives ? 0.3 : 0.6,
          topics: [] as string[],
          keywords: [...POSITIVE_CUES, ...NEGATIVE_CUES].filter((cue) =>
            lower.includes(cue),
          ),
          summary: text.slice(0, 200),
        } as const
      })

      return ok({
        items: [...items],
        modelId: 'local-lexicon-v0',
        usage: { inputTokens: 0, outputTokens: 0 },
        // No provider call, so nothing to charge for.
        costMicroIdr: 0,
      })
    },
  }
}
