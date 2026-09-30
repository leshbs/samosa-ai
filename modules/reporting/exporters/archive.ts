import { strToU8, zipSync, type Zippable } from 'fflate'

/**
 * The organization archive (checklist 5.7): one zip holding every dataset,
 * every report as PDF and CSV, and a metadata file tying them together. This
 * file only packs bytes; what goes in is decided by the caller.
 */

export type ArchiveEntry = {
  /** Forward slashes, no leading slash: "reports/pensi-2026-3f2a.pdf". */
  path: string
  content: Uint8Array | string
}

/** Already compressed: deflating a PDF again spends CPU to save nothing. */
const STORED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.zip']
/** fflate's middle setting; text is most of the archive and compresses well. */
const TEXT_LEVEL = 6

/**
 * A readable, filesystem-safe name. Unicode letters fold to ASCII where they
 * can ("Évaluasi" → "evaluasi"); anything else becomes a hyphen.
 */
export function archiveSlug(name: string, fallback: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  return slug || fallback
}

/**
 * Packs the entries into a zip. A repeated path gets a numeric suffix rather
 * than silently replacing the earlier file: two datasets called "Survei" are
 * two files in the archive.
 */
export function buildArchive(entries: readonly ArchiveEntry[]): Uint8Array {
  const files: Zippable = {}

  for (const entry of entries) {
    const path = uniquePath(files, entry.path.replace(/^\/+/, ''))
    const bytes =
      typeof entry.content === 'string' ? strToU8(entry.content) : entry.content
    const stored = STORED_EXTENSIONS.some((extension) => path.endsWith(extension))
    files[path] = [bytes, { level: stored ? 0 : TEXT_LEVEL }]
  }

  return zipSync(files)
}

function uniquePath(files: Zippable, path: string): string {
  if (!(path in files)) return path
  const dot = path.lastIndexOf('.')
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path
  const extension = dot > path.lastIndexOf('/') ? path.slice(dot) : ''
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem}-${copy}${extension}`
    if (!(candidate in files)) return candidate
  }
}
