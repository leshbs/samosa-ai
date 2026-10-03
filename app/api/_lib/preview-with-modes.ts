import { createOpenAiAdapter, detectModes, type ModeGuess } from '@/modules/analysis'
import { previewDataset, type DatasetPreview } from '@/modules/ingestion'
import type { AppError, Result } from '@/modules/shared'
import { ok } from '@/modules/shared'
import type { DatasetSource } from '@/types/domain'

/**
 * The upload wizard's second step: the sheet's headers, a few rows to
 * recognise them by, and a guess at what each column holds.
 *
 * Composed here because ingestion reads the sheet and analysis owns every
 * model call; neither may reach into the other. Only each column's header and
 * profile cross from one to the other — never a cell (ADR-0016).
 */
export type PreviewWithModes = Omit<DatasetPreview, 'profiles'> & {
  /** One guess per column, in `columns` order. */
  modes: ModeGuess[]
  /** Which prompt made the guesses; null when the rules did. */
  modeDetection: { promptVersion: string | null; modelId: string | null }
}

export async function previewWithModes(
  file: File,
  source: DatasetSource,
): Promise<Result<PreviewWithModes, AppError>> {
  const preview = await previewDataset(file, source)
  if (!preview.ok) return preview

  const { profiles, ...rest } = preview.value
  // Cannot fail: a model that does not answer leaves the rules' guess.
  const detection = await detectModes(createOpenAiAdapter(), profiles)

  return ok({
    ...rest,
    modes: detection.guesses,
    modeDetection: {
      promptVersion: detection.promptVersion,
      modelId: detection.modelId,
    },
  })
}
