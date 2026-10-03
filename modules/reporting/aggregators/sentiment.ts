import { SENTIMENTS, type Sentiment } from '@/types/domain'

export type SentimentDistribution = {
  /** Records that carry a sentiment: the denominator of every share. */
  total: number
  counts: Record<Sentiment, number>
  shares: Record<Sentiment, number>
  /** The single sentiment the dataset leans to, or null when it is a dead heat. */
  dominant: Sentiment | null
}

const EMPTY: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 }

/**
 * Sentiment is an ordered scale (positive - neutral - negative), so the chart
 * built from this is a diverging stacked bar rather than a pie; the shares are
 * returned alongside the counts because a reader compares proportions, and
 * dividing in the component would put that arithmetic outside the tests.
 *
 * A record without a sentiment — an answer to a question that asks for a
 * choice, a number or a reflection — is not in the total. Counting it would
 * shrink every share by answers that were never judged.
 */
export function aggregateSentiment(
  records: ReadonlyArray<{ sentiment: Sentiment | null }>,
): SentimentDistribution {
  const counts = { ...EMPTY }
  let total = 0
  for (const record of records) {
    if (record.sentiment !== null && record.sentiment in counts) {
      counts[record.sentiment] += 1
      total += 1
    }
  }

  const shares = { ...EMPTY }
  for (const sentiment of SENTIMENTS) {
    shares[sentiment] = total === 0 ? 0 : counts[sentiment] / total
  }

  return { total, counts, shares, dominant: pickDominant(counts) }
}

/**
 * A tie has no winner. Returning the first of two equal sentiments would let
 * the overview announce "mostly positive" about a dataset that is half
 * negative, which is the kind of claim this tool exists to avoid.
 */
function pickDominant(counts: Record<Sentiment, number>): Sentiment | null {
  const ranked = SENTIMENTS.map((sentiment) => ({ sentiment, count: counts[sentiment] }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  const [leader, runnerUp] = ranked
  if (!leader) return null
  if (runnerUp && runnerUp.count === leader.count) return null
  return leader.sentiment
}
