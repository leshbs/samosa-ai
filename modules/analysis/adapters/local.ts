import { ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { guessModeByRule } from '../services/mode-rules'
import type {
  BatchInput,
  BatchOutput,
  ClassifyInput,
  ClassifyOutput,
  LlmAdapter,
  SummaryInput,
  SummaryOutput,
} from './types'

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

    /**
     * Template prose over the aggregate figures. Not a substitute for the
     * model's writing -- it exists so offline runs produce a report that is
     * complete and checkable rather than one with an empty summary.
     */
    async summarize(input: SummaryInput): Promise<Result<SummaryOutput, AppError>> {
      const { totalResponses, sentimentCounts, topTopics } = input.data
      const share = (count: number) =>
        totalResponses === 0 ? 0 : Math.round((count / totalResponses) * 100)

      const positive = sentimentCounts.positive ?? 0
      const negative = sentimentCounts.negative ?? 0

      const summary =
        `Dari ${totalResponses} aspirasi, ${share(positive)}% bernada positif dan ` +
        `${share(negative)}% negatif. ` +
        (topTopics.length > 0
          ? `Topik yang paling sering muncul adalah ${topTopics
              .slice(0, 3)
              .map((topic) => topic.topic)
              .join(', ')}.`
          : 'Belum ada topik yang cukup sering muncul untuk disorot.') +
        ' Ringkasan ini disusun tanpa model bahasa, jadi hanya memuat angka yang terukur.'

      const insights = topTopics.slice(0, 3).map((topic) => ({
        title: `Topik: ${topic.topic}`.slice(0, 60),
        detail: `${topic.topic} disebut di ${topic.count} aspirasi (${share(
          topic.count,
        )}% dari total).`,
        evidence: [] as number[],
        question: null,
      }))

      return ok({
        summary,
        insights:
          insights.length > 0
            ? insights
            : [
                {
                  title: 'Belum ada pola yang menonjol',
                  detail: `Dari ${totalResponses} aspirasi, belum ada topik yang cukup berulang untuk disimpulkan.`,
                  evidence: [] as number[],
                  question: null,
                },
              ],
        citesQuestions: false,
        modelId: 'local-lexicon-v0',
        usage: { inputTokens: 0, outputTokens: 0 },
        costMicroIdr: 0,
      })
    },

    /** The same rules the wizard falls back to when the model does not answer. */
    async classifyColumns(
      input: ClassifyInput,
    ): Promise<Result<ClassifyOutput, AppError>> {
      return ok({
        modes: input.columns.map(guessModeByRule),
        modelId: 'local-lexicon-v0',
        usage: { inputTokens: 0, outputTokens: 0 },
        costMicroIdr: 0,
      })
    },
  }
}
