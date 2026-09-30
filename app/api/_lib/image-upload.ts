import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { MAX_IMAGE_BYTES } from '@/types/api'

/**
 * The one `file` field of a logo or avatar upload, as bytes. Size is checked
 * here before anything is buffered twice; the format is the service's call,
 * because only the bytes can say what the file is.
 */
export async function readImageField(
  request: Request,
): Promise<Result<Uint8Array, AppError>> {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return err(appError(ERROR_CODES.VALIDATION, 'Pilih gambar untuk diunggah'))
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Gambar maksimal 1 MB. Perkecil dulu ukurannya, lalu unggah lagi.',
      ),
    )
  }
  return ok(new Uint8Array(await file.arrayBuffer()))
}
