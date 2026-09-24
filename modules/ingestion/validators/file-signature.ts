import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { DatasetSource } from '@/types/domain'

/**
 * What a browser puts in `file.type` for a spreadsheet is close to useless:
 * Windows reports `.csv` as `application/vnd.ms-excel`, some Linux browsers
 * send `text/plain`, and a drag-and-drop from a zip viewer can send nothing at
 * all. So the MIME type is treated as a coarse deny-list and the real check is
 * the first bytes of the file.
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  '',
  'text/csv',
  'text/plain',
  'application/csv',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const ALLOWED_EXTENSIONS = ['.csv', '.xls', '.xlsx'] as const

/** Formats we refuse outright, whatever the extension and MIME type claim. */
const REJECTED_SIGNATURES: ReadonlyArray<{ label: string; bytes: readonly number[] }> = [
  { label: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
  { label: 'ELF', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { label: 'EXE', bytes: [0x4d, 0x5a] },
  { label: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { label: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { label: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
  { label: 'GZIP', bytes: [0x1f, 0x8b] },
  { label: 'RAR', bytes: [0x52, 0x61, 0x72, 0x21] },
  { label: '7Z', bytes: [0x37, 0x7a, 0xbc, 0xaf] },
]

/** `.xlsx` is a zip; the legacy `.xls` is an OLE2 compound file. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0] as const

/** Enough to cover every signature plus a look for stray NUL bytes. */
const SNIFF_BYTES = 4096

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * Name, size and MIME — everything that can be judged before reading the file.
 * `size` is checked by the caller's own limit so this stays a pure predicate.
 */
export function validateUploadFile(file: {
  name: string
  type: string
}): Result<void, AppError> {
  const extension = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Hanya file CSV atau Excel yang bisa diunggah', {
        details: { extension, allowed: ALLOWED_EXTENSIONS },
      }),
    )
  }

  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Tipe file tidak didukung', {
        details: { type: file.type },
      }),
    )
  }

  return ok(undefined)
}

/**
 * The check the extension cannot give us: does the content match what the
 * upload claims to be? A route handler takes `source` from the request body, so
 * without this a PDF posted as `source=csv` would reach the parser.
 */
export function validateFileSignature(
  buffer: ArrayBuffer,
  source: DatasetSource,
): Result<void, AppError> {
  const head = new Uint8Array(buffer.slice(0, SNIFF_BYTES))

  if (head.length === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'File kosong'))
  }

  const rejected = REJECTED_SIGNATURES.find((candidate) =>
    startsWith(head, candidate.bytes),
  )
  if (rejected) {
    return err(
      appError(ERROR_CODES.VALIDATION, 'Isi file bukan CSV atau Excel', {
        details: { detected: rejected.label },
      }),
    )
  }

  if (source === 'xlsx') {
    const isSpreadsheet =
      startsWith(head, ZIP_SIGNATURE) || startsWith(head, OLE2_SIGNATURE)
    if (!isSpreadsheet) {
      return err(appError(ERROR_CODES.VALIDATION, 'File ini bukan file Excel yang valid'))
    }
    return ok(undefined)
  }

  // A spreadsheet renamed to .csv: catch it here rather than letting the CSV
  // parser turn binary into one very wide column of mojibake.
  if (startsWith(head, ZIP_SIGNATURE) || startsWith(head, OLE2_SIGNATURE)) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'File ini sebenarnya Excel, bukan CSV — unggah sebagai .xlsx',
      ),
    )
  }

  // Text has no NUL bytes. This also rejects UTF-16, which the parser decodes
  // as UTF-8 and silently turns into garbage — a clear refusal is kinder.
  if (head.includes(0x00)) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'File CSV harus berupa teks UTF-8, bukan file biner',
      ),
    )
  }

  return ok(undefined)
}
