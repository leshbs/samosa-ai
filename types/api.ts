import { z } from 'zod'
import { datasetSourceSchema } from '@/types/domain'
import type { ErrorCode } from '@/modules/shared'

export type ApiSuccess<T> = { data: T }
export type ApiFailure = {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_RESPONSE_LENGTH = 4_000

export const createDatasetSchema = z.object({
  name: z.string().min(1).max(120),
  source: datasetSourceSchema,
  /** Column in the uploaded sheet that holds the free-text aspiration. */
  textColumn: z.string().min(1).max(200),
})
export type CreateDatasetInput = z.infer<typeof createDatasetSchema>

export const createAnalysisSchema = z.object({
  datasetId: z.string().uuid(),
  promptVersion: z.string().default('v1'),
})
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>

export const reportExportSchema = z.object({
  format: z.enum(['pdf', 'csv', 'xlsx']),
})
export type ReportExportInput = z.infer<typeof reportExportSchema>
