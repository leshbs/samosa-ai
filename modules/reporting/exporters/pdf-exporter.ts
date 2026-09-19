import { ERROR_CODES, appError, err, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { Report } from '@/types/domain'

export type PdfExport = {
  bytes: Uint8Array
  fileName: string
}

/**
 * Not implemented yet: the renderer choice (headless Chromium vs. a pure-JS
 * layout library) is still open — see docs/adr/0003-pdf-rendering.md.
 * Wired up now so the reporting public API is stable for the UI.
 */
export async function exportReportToPdf(
  report: Report,
): Promise<Result<PdfExport, AppError>> {
  void report
  return err(
    appError(ERROR_CODES.INTERNAL, 'PDF export is not implemented yet', {
      details: { adr: 'docs/adr/0003-pdf-rendering.md' },
    }),
  )
}
