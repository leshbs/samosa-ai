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

/**
 * Messages are Indonesian because they travel: a failed parse is returned in
 * `error.details.issues`, and the upload wizard renders them next to the field
 * that caused them. A Zod default would put English in an otherwise
 * Indonesian form.
 */
export const createDatasetSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama dataset wajib diisi')
    .max(120, 'Nama dataset maksimal 120 karakter'),
  source: datasetSourceSchema,
  /** Column in the uploaded sheet that holds the free-text aspiration. */
  textColumn: z
    .string()
    .min(1, 'Pilih kolom yang berisi aspirasi')
    .max(200, 'Nama kolom maksimal 200 karakter'),
})
export type CreateDatasetInput = z.infer<typeof createDatasetSchema>

export const createAnalysisSchema = z.object({
  datasetId: z.string().uuid('ID dataset tidak valid'),
  /** Left optional so the prompt registry stays the single source of the default. */
  promptVersion: z.string().optional(),
})
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>

export const reportExportSchema = z.object({
  format: z.enum(['pdf', 'csv', 'xlsx']),
})
export type ReportExportInput = z.infer<typeof reportExportSchema>

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Nama wajib diisi')
    .max(80, 'Nama maksimal 80 karakter'),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const updateOrganizationSchema = z.object({
  // Matches the check constraint on organizations.name.
  name: z
    .string()
    .trim()
    .min(1, 'Nama organisasi wajib diisi')
    .max(120, 'Nama organisasi maksimal 120 karakter'),
})
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
