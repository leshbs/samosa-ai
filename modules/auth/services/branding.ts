import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { MAX_IMAGE_BYTES } from '@/types/api'
import type { OrgRole } from '@/types/domain'
import { can } from '../policies/org-policy'

/**
 * Organization logos and profile avatars.
 *
 * The `branding` bucket is private with no policies, so everything here uses
 * the service role, and every function either checks the caller's permission
 * itself or takes an id the caller could only have got from its own session.
 * Paths are always built here and checked against their owner's prefix before
 * they are signed or read: the database columns that hold them are not
 * writable by the anon key, and this is the second lock on the same door.
 */

export const BRANDING_BUCKET = 'branding'

/** Long enough to outlive a page view, short enough that a copied URL dies. */
const SIGNED_URL_SECONDS = 60 * 60

export type ImageFormat = 'png' | 'jpg'

const CONTENT_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * The bytes decide, not the filename or the browser's MIME type — both are
 * whatever the uploader says they are. PNG and JPEG only, because those are
 * the two formats the PDF renderer can embed.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpg'
  return null
}

export function validateImage(bytes: Uint8Array): Result<ImageFormat, AppError> {
  if (bytes.byteLength === 0) {
    return err(appError(ERROR_CODES.VALIDATION, 'File gambarnya kosong'))
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Gambar maksimal 1 MB. Perkecil dulu ukurannya, lalu unggah lagi.',
      ),
    )
  }
  const format = detectImageFormat(bytes)
  if (!format) {
    return err(appError(ERROR_CODES.VALIDATION, 'Gambar harus berformat PNG atau JPEG'))
  }
  return ok(format)
}

export function organizationBrandingPrefix(organizationId: string): string {
  return `org/${organizationId}/`
}

export function userBrandingPrefix(userId: string): string {
  return `user/${userId}/`
}

/** True only for a path that sits under `prefix` and cannot climb out of it. */
export function isPathUnder(
  path: string | null | undefined,
  prefix: string,
): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.includes('..')
  )
}

async function storeImage(
  prefix: string,
  name: string,
  bytes: Uint8Array,
  format: ImageFormat,
): Promise<Result<string, AppError>> {
  // A fresh name per upload, so a browser holding the old signed URL never
  // shows the old picture under the new one's name.
  const path = `${prefix}${name}-${crypto.randomUUID().slice(0, 8)}.${format}`

  const { error } = await createAdminClient()
    .storage.from(BRANDING_BUCKET)
    .upload(path, bytes, { contentType: CONTENT_TYPES[format], upsert: false })

  if (error) {
    logger.error('auth.branding.upload_failed', { prefix })
    return err(appError(ERROR_CODES.INTERNAL, 'Gambar tidak bisa disimpan. Coba lagi.'))
  }
  return ok(path)
}

/** Best effort: the row no longer points at it, so a leftover is only bytes. */
async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await createAdminClient().storage.from(BRANDING_BUCKET).remove(paths)
  if (error) logger.warn('auth.branding.object_orphaned', { count: paths.length })
}

type OrganizationActor = { organizationId: string; role: OrgRole }

function requireManager(actor: OrganizationActor): Result<void, AppError> {
  return can(actor.role, 'org:manage')
    ? ok(undefined)
    : err(appError(ERROR_CODES.FORBIDDEN, 'Hanya pemilik yang bisa mengubah logo'))
}

export async function setOrganizationLogo(
  actor: OrganizationActor,
  bytes: Uint8Array,
): Promise<Result<{ logoPath: string }, AppError>> {
  const allowed = requireManager(actor)
  if (!allowed.ok) return allowed
  const format = validateImage(bytes)
  if (!format.ok) return format

  const supabase = createAdminClient()
  const prefix = organizationBrandingPrefix(actor.organizationId)
  const { data: current } = await supabase
    .from('organizations')
    .select('logo_path')
    .eq('id', actor.organizationId)
    .maybeSingle()

  const stored = await storeImage(prefix, 'logo', bytes, format.value)
  if (!stored.ok) return stored

  const { error } = await supabase
    .from('organizations')
    .update({ logo_path: stored.value })
    .eq('id', actor.organizationId)

  if (error) {
    await removeObjects([stored.value])
    return err(appError(ERROR_CODES.INTERNAL, 'Logo tidak bisa disimpan. Coba lagi.'))
  }

  const previous = current?.logo_path
  if (isPathUnder(previous, prefix)) await removeObjects([previous])
  return ok({ logoPath: stored.value })
}

export async function clearOrganizationLogo(
  actor: OrganizationActor,
): Promise<Result<void, AppError>> {
  const allowed = requireManager(actor)
  if (!allowed.ok) return allowed

  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('organizations')
    .select('logo_path')
    .eq('id', actor.organizationId)
    .maybeSingle()

  const { error } = await supabase
    .from('organizations')
    .update({ logo_path: null })
    .eq('id', actor.organizationId)
  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Logo tidak bisa dihapus'))

  const previous = current?.logo_path
  if (isPathUnder(previous, organizationBrandingPrefix(actor.organizationId))) {
    await removeObjects([previous])
  }
  return ok(undefined)
}

/**
 * Anyone may change their own avatar; `userId` must come from the session.
 * The profile row may not exist yet for an account created after the
 * backfill, so an update that touched nothing becomes an insert.
 */
export async function setAvatar(
  userId: string,
  bytes: Uint8Array,
): Promise<Result<{ avatarPath: string }, AppError>> {
  const format = validateImage(bytes)
  if (!format.ok) return format

  const supabase = createAdminClient()
  const prefix = userBrandingPrefix(userId)
  const { data: current } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = await storeImage(prefix, 'avatar', bytes, format.value)
  if (!stored.ok) return stored

  const { error } = current
    ? await supabase
        .from('profiles')
        .update({ avatar_path: stored.value, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    : await supabase
        .from('profiles')
        .insert({ user_id: userId, avatar_path: stored.value })

  if (error) {
    await removeObjects([stored.value])
    return err(appError(ERROR_CODES.INTERNAL, 'Foto tidak bisa disimpan. Coba lagi.'))
  }

  const previous = current?.avatar_path
  if (isPathUnder(previous, prefix)) await removeObjects([previous])
  return ok({ avatarPath: stored.value })
}

export async function clearAvatar(userId: string): Promise<Result<void, AppError>> {
  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('user_id', userId)
    .maybeSingle()

  if (!current?.avatar_path) return ok(undefined)

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_path: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) return err(appError(ERROR_CODES.INTERNAL, 'Foto tidak bisa dihapus'))

  if (isPathUnder(current.avatar_path, userBrandingPrefix(userId))) {
    await removeObjects([current.avatar_path])
  }
  return ok(undefined)
}

/**
 * Signed URLs for paths the caller already read through RLS — its own
 * organization's logo, the avatars of people in its organization. Anything
 * that does not look like a branding path is dropped rather than signed.
 */
export async function signBrandingUrls(
  paths: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const wanted = [
    ...new Set(
      paths.filter(
        (path): path is string => isPathUnder(path, 'org/') || isPathUnder(path, 'user/'),
      ),
    ),
  ]
  if (wanted.length === 0) return new Map()

  try {
    const { data, error } = await createAdminClient()
      .storage.from(BRANDING_BUCKET)
      .createSignedUrls(wanted, SIGNED_URL_SECONDS)
    if (error || !data) return new Map()

    const urls = new Map<string, string>()
    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error)
        urls.set(entry.path, entry.signedUrl)
    }
    return urls
  } catch {
    // A missing picture degrades to initials; it never fails the page.
    return new Map()
  }
}

export async function signBrandingUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null
  return (await signBrandingUrls([path])).get(path) ?? null
}

export type LogoImage = { data: Uint8Array; format: ImageFormat }

/** The organization's logo as bytes, for embedding in a PDF. Null when unset. */
export async function readOrganizationLogo(
  organizationId: string,
): Promise<LogoImage | null> {
  try {
    const supabase = createAdminClient()
    const { data: row } = await supabase
      .from('organizations')
      .select('logo_path')
      .eq('id', organizationId)
      .maybeSingle()

    const path = row?.logo_path
    if (!isPathUnder(path, organizationBrandingPrefix(organizationId))) return null

    const { data: blob, error } = await supabase.storage
      .from(BRANDING_BUCKET)
      .download(path)
    if (error || !blob) return null

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const format = detectImageFormat(bytes)
    return format ? { data: bytes, format } : null
  } catch {
    // A report without its logo is still the report.
    logger.warn('auth.branding.logo_unreadable', { organizationId })
    return null
  }
}

/** Everything under a prefix, a page at a time; storage lists 100 by default. */
async function listPrefix(prefix: string): Promise<string[]> {
  const bucket = createAdminClient().storage.from(BRANDING_BUCKET)
  const folder = prefix.replace(/\/$/, '')
  const paths: string[] = []
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await bucket.list(folder, { limit: pageSize, offset })
    if (error || !data || data.length === 0) break
    paths.push(...data.map((entry) => `${folder}/${entry.name}`))
    if (data.length < pageSize) break
  }
  return paths
}

/** Called after an organization is deleted; its row no longer names a logo. */
export async function purgeOrganizationBranding(organizationId: string): Promise<void> {
  try {
    await removeObjects(await listPrefix(organizationBrandingPrefix(organizationId)))
  } catch {
    logger.warn('auth.branding.purge_failed', { organizationId })
  }
}
