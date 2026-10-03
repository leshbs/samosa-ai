import { z } from 'zod'
import {
  analysisModeSchema,
  datasetSourceSchema,
  invitableRoleSchema,
  isQuestionMode,
  orgTimeZoneSchema,
} from '@/types/domain'
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
export const createDatasetSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Nama dataset wajib diisi')
      .max(120, 'Nama dataset maksimal 120 karakter'),
    source: datasetSourceSchema,
    /**
     * Columns of the uploaded sheet that hold free-text answers: one question of
     * the dataset each. The limit is enforced where the sheet is read
     * (MAX_QUESTIONS_PER_DATASET); the bound here only keeps the request sane.
     */
    textColumns: z
      .array(z.string().min(1).max(200, 'Nama kolom maksimal 200 karakter'))
      .max(50)
      .default([]),
    /**
     * Every column the wizard showed with the mode chosen for it and the mode
     * the system guessed. Replaces `textColumns`, which a wizard loaded before
     * the deploy still sends: its columns are read as `evaluative`.
     */
    columnModes: z
      .array(
        z.object({
          column: z.string().min(1).max(200, 'Nama kolom maksimal 200 karakter'),
          mode: analysisModeSchema,
          detectedMode: analysisModeSchema.nullable().default(null),
        }),
      )
      .max(200)
      .default([]),
    /** Which prompt made the guesses. Recorded for research; trusted for nothing. */
    modeDetection: z
      .object({
        promptVersion: z.string().max(40).nullable().default(null),
        modelId: z.string().max(80).nullable().default(null),
      })
      .optional(),
    /**
     * Columns to store alongside the text. Absent means store none — the caller
     * opts data in rather than out, so a request that forgets this field stores
     * the least, not the most.
     */
    keepColumns: z
      .array(z.string().max(200))
      .max(50, 'Maksimal 50 kolom tambahan')
      .default([]),
  })
  .refine(
    (value) =>
      value.textColumns.length > 0 ||
      value.columnModes.some((choice) => isQuestionMode(choice.mode)),
    { message: 'Pilih paling tidak satu kolom untuk dianalisis', path: ['columnModes'] },
  )
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

/** At least one field, so an empty PATCH is a 400 rather than a silent no-op. */
function someField(value: Record<string, unknown>): boolean {
  return Object.values(value).some((field) => field !== undefined)
}

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Nama wajib diisi')
      .max(80, 'Nama maksimal 80 karakter')
      .optional(),
    /** Free text: "Sekretaris OSIS 2026/2027". Blank clears it. */
    title: z.string().trim().max(80, 'Jabatan maksimal 80 karakter').optional(),
    notifyAnalysisFinished: z.boolean().optional(),
  })
  .refine(someField, 'Tidak ada yang diubah')
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const updateOrganizationSchema = z
  .object({
    // Matches the check constraint on organizations.name.
    name: z
      .string()
      .trim()
      .min(1, 'Nama wajib diisi')
      .max(120, 'Nama maksimal 120 karakter')
      .optional(),
    timezone: orgTimeZoneSchema.optional(),
    reportIncludeQuotes: z.boolean().optional(),
    reportIncludeTopicTail: z.boolean().optional(),
    reportIncludeProvenance: z.boolean().optional(),
  })
  .refine(someField, 'Tidak ada yang diubah')
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * Typed confirmation for the two actions that cannot be undone from inside the
 * app. Checked again on the server: a disabled button is not a control.
 */
const confirmationSchema = z.string().trim().min(1, 'Ketik namanya untuk konfirmasi')

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid('Anggota tidak valid'),
  confirmation: confirmationSchema,
})
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>

export const deleteOrganizationSchema = z.object({ confirmation: confirmationSchema })

export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Masukkan email yang valid')
    .max(320, 'Email terlalu panjang'),
  role: invitableRoleSchema,
  /** Sent with the first invitation, which is when a workspace gets a name. */
  organizationName: z
    .string()
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(120, 'Nama maksimal 120 karakter')
    .optional(),
})
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>

export const updateMemberSchema = z.object({ role: invitableRoleSchema })

/** base64url of 32 random bytes is 43 characters; the bounds only reject junk. */
export const acceptInvitationSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  /** The caller confirms leaving the organization they follow now. */
  leave: z.boolean().optional(),
})

/** 1 MB, the `branding` bucket's file_size_limit. */
export const MAX_IMAGE_BYTES = 1024 * 1024
